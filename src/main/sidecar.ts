import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { AudioDevice, AudioLevel, DeviceList, SessionStatus, TranscriptSegment } from '@shared/types'

// Eventi dal sidecar (BUILD-SPEC §6.1).
interface ReadyEvt { event: 'ready' }
interface DevicesEvt { event: 'devices'; mic: AudioDevice[]; loopback: AudioDevice[] }
interface StatusEvt { event: 'status'; session_id: string; state: 'capturing' | 'finalizing' }
interface LevelEvt { event: 'level'; speaker: 'me' | 'others'; rms: number }
interface SegmentEvt {
  event: 'segment'
  session_id: string
  speaker: 'me' | 'others'
  ts_start: number
  ts_end: number
  text: string
  seq: number
}
interface FinalSeg { speaker: 'me' | 'others'; ts_start: number; ts_end: number; text: string; seq: number }
interface FinalEvt { event: 'final'; session_id: string; segments: FinalSeg[] }
interface StoppedEvt { event: 'stopped'; session_id: string }
interface ErrorEvt { event: 'error'; message: string; fatal: boolean }
type SidecarEvent =
  | ReadyEvt
  | DevicesEvt
  | StatusEvt
  | LevelEvt
  | SegmentEvt
  | FinalEvt
  | StoppedEvt
  | ErrorEvt

type SegmentCb = (s: TranscriptSegment) => void
type StatusCb = (s: SessionStatus) => void
type LevelCb = (l: AudioLevel) => void
type FinalCb = (meetingId: string, segments: TranscriptSegment[]) => void
type ErrorCb = (message: string, fatal: boolean) => void

function resolvePython(): string {
  // dev: preferisci il venv del sidecar; altrimenti il launcher di sistema.
  const root = app.getAppPath()
  const venv = join(root, 'sidecar', '.venv', 'Scripts', 'python.exe')
  if (existsSync(venv)) return venv
  return process.platform === 'win32' ? 'py' : 'python3'
}

function resolveScript(): string {
  const root = app.getAppPath()
  const name = process.env['SCRIBIO_SIDECAR_MOCK'] === '1' ? 'mock.py' : 'main.py'
  return join(root, 'sidecar', name)
}

/** Eseguibile + args per spawnare il sidecar (prod: exe PyInstaller, dev: python). */
function resolveSpawn(): { cmd: string; args: string[]; cwd: string } {
  if (app.isPackaged) {
    // onedir PyInstaller copiato in resources/sidecar via extraResources
    const dir = join(process.resourcesPath, 'sidecar')
    return { cmd: join(dir, 'scribio-sidecar.exe'), args: [], cwd: dir }
  }
  const py = resolvePython()
  const script = resolveScript()
  const args = py === 'py' ? ['-3', script] : [script]
  return { cmd: py, args, cwd: join(app.getAppPath(), 'sidecar') }
}

/** Cartella (in userData) dove whisper.cpp scarica i modelli GGUF al primo uso. */
function modelDir(): string {
  const dir = join(app.getPath('userData'), 'models')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* noop */
  }
  return dir
}

/** Cartella con whisper-server.exe + DLL (build Vulkan). */
function whisperDir(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'whisper')
  return join(app.getAppPath(), 'sidecar', 'whisper-bin')
}

export class SidecarManager {
  private proc: ChildProcessWithoutNullStreams | null = null
  private rl: Interface | null = null
  private ready = false
  private readyWaiters: Array<() => void> = []
  private devicesWaiters: Array<(d: DeviceList) => void> = []
  private stoppedWaiters = new Map<string, Array<() => void>>()

  private segmentCbs = new Set<SegmentCb>()
  private statusCbs = new Set<StatusCb>()
  private levelCbs = new Set<LevelCb>()
  private finalCbs = new Set<FinalCb>()
  private errorCbs = new Set<ErrorCb>()

  onSegment(cb: SegmentCb): void { this.segmentCbs.add(cb) }
  onStatus(cb: StatusCb): void { this.statusCbs.add(cb) }
  onLevel(cb: LevelCb): void { this.levelCbs.add(cb) }
  onFinal(cb: FinalCb): void { this.finalCbs.add(cb) }
  onError(cb: ErrorCb): void { this.errorCbs.add(cb) }

  /** Avvia il processo (idempotente) e attende l'handshake `ready`. */
  async ensureStarted(): Promise<void> {
    if (this.proc && this.ready) return
    if (!this.proc) this.spawnProc()
    if (this.ready) return
    await new Promise<void>((resolve) => this.readyWaiters.push(resolve))
  }

  private spawnProc(): void {
    const { cmd, args, cwd } = resolveSpawn()
    const proc = spawn(cmd, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SCRIBIO_MODEL_DIR: modelDir(),
        SCRIBIO_WHISPER_DIR: whisperDir(),
        // forza UTF-8 sui canali del sidecar (accenti IT corretti, no '�')
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8'
      }
    })
    this.proc = proc
    this.ready = false

    this.rl = createInterface({ input: proc.stdout })
    this.rl.on('line', (line) => this.onLine(line))
    proc.stderr.on('data', (d: Buffer) => console.error('[sidecar]', d.toString().trimEnd()))

    proc.on('exit', (code) => {
      console.error(`[sidecar] uscito (code=${code})`)
      this.cleanupProc()
      // rilancio se morte inattesa (non durante quit dell'app)
      if (!app.isReady()) return
    })
  }

  private cleanupProc(): void {
    this.rl?.close()
    this.rl = null
    this.proc = null
    this.ready = false
  }

  private onLine(line: string): void {
    let evt: SidecarEvent
    try {
      evt = JSON.parse(line) as SidecarEvent
    } catch {
      console.error('[sidecar] riga non-JSON:', line)
      return
    }
    switch (evt.event) {
      case 'ready':
        this.ready = true
        this.readyWaiters.splice(0).forEach((r) => r())
        break
      case 'devices':
        this.devicesWaiters.splice(0).forEach((r) => r({ mic: evt.mic, loopback: evt.loopback }))
        break
      case 'status':
        this.statusCbs.forEach((cb) => cb({ meetingId: evt.session_id, state: evt.state }))
        break
      case 'level':
        this.levelCbs.forEach((cb) => cb({ speaker: evt.speaker, rms: evt.rms }))
        break
      case 'segment':
        this.segmentCbs.forEach((cb) =>
          cb({
            id: `${evt.session_id}-${evt.seq}`,
            meetingId: evt.session_id,
            speaker: evt.speaker,
            tsStart: evt.ts_start,
            tsEnd: evt.ts_end,
            text: evt.text,
            seq: evt.seq
          })
        )
        break
      case 'final': {
        const segs: TranscriptSegment[] = evt.segments.map((s) => ({
          id: `${evt.session_id}-${s.seq}`,
          meetingId: evt.session_id,
          speaker: s.speaker,
          tsStart: s.ts_start,
          tsEnd: s.ts_end,
          text: s.text,
          seq: s.seq
        }))
        this.finalCbs.forEach((cb) => cb(evt.session_id, segs))
        break
      }
      case 'stopped': {
        const waiters = this.stoppedWaiters.get(evt.session_id)
        if (waiters) {
          this.stoppedWaiters.delete(evt.session_id)
          waiters.forEach((r) => r())
        }
        break
      }
      case 'error':
        console.error('[sidecar] error:', evt.message, 'fatal=', evt.fatal)
        this.errorCbs.forEach((cb) => cb(evt.message, evt.fatal))
        break
    }
  }

  private send(obj: Record<string, unknown>): void {
    if (!this.proc) throw new Error('Sidecar non avviato.')
    this.proc.stdin.write(JSON.stringify(obj) + '\n')
  }

  async listDevices(): Promise<DeviceList> {
    await this.ensureStarted()
    const p = new Promise<DeviceList>((resolve) => this.devicesWaiters.push(resolve))
    this.send({ cmd: 'list_devices' })
    return p
  }

  /** Avvia il probe del VU-meter (onboarding): apre mic+loopback e emette `level`. */
  async probe(opts: { micIndex?: number | null; loopbackIndex?: number | null }): Promise<void> {
    await this.ensureStarted()
    this.send({
      cmd: 'probe',
      mic_index: opts.micIndex ?? null,
      loopback_index: opts.loopbackIndex ?? null
    })
  }

  probeStop(): void {
    if (!this.proc) return
    this.send({ cmd: 'probe_stop' })
  }

  async start(opts: {
    sessionId: string
    sttModel?: string
    language?: string
    micIndex?: number | null
    loopbackIndex?: number | null
  }): Promise<void> {
    await this.ensureStarted()
    this.send({
      cmd: 'start',
      session_id: opts.sessionId,
      stt_model: opts.sttModel ?? 'small',
      language: opts.language ?? 'it',
      mic_index: opts.micIndex ?? null,
      loopback_index: opts.loopbackIndex ?? null
    })
  }

  stop(sessionId: string): void {
    if (!this.proc) return
    this.send({ cmd: 'stop', session_id: sessionId })
  }

  /** Invia stop e attende l'evento `stopped` (o timeout) per garantire che il
   *  worker abbia drenato la coda — così i segmenti finali sono nel buffer. */
  async stopAndWait(sessionId: string, timeoutMs = 20000): Promise<void> {
    if (!this.proc) return
    const p = new Promise<void>((resolve) => {
      const arr = this.stoppedWaiters.get(sessionId) ?? []
      arr.push(resolve)
      this.stoppedWaiters.set(sessionId, arr)
    })
    this.send({ cmd: 'stop', session_id: sessionId })
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs)
    })
    await Promise.race([p, timeout])
    if (timer) clearTimeout(timer)
  }

  dispose(): void {
    if (this.proc) {
      try {
        this.proc.stdin.end()
      } catch {
        /* noop */
      }
      this.proc.kill()
    }
    this.cleanupProc()
  }
}

let manager: SidecarManager | null = null
export function getSidecar(): SidecarManager {
  if (!manager) manager = new SidecarManager()
  return manager
}
