import { BrowserWindow, ipcMain } from 'electron'
import type {
  DeviceList,
  MeetingDetail,
  MeetingListItem,
  SearchResult,
  Settings,
  StartSessionOptions,
  Template
} from '@shared/types'
import {
  createMeeting,
  getMeeting,
  listMeetings,
  reindexMeeting,
  removeMeeting,
  renameMeeting,
  replaceSegments,
  saveRawNotes,
  searchFullText,
  setMeetingStatus
} from './db/repositories'
import { getDb } from './db/db'
import { hasOpenAIKey, setOpenAIKey } from './secrets'
import { loadSettings, saveSettings } from './store'
import { getSidecar } from './sidecar'
import { enhanceMeeting } from './llm/enhance'
import { askMeeting, askGlobal } from './llm/ask'
import { signIn, signUp, signOut, currentUser } from './cloud/auth'
import { syncMeetingSafe, deleteMeetingCloudSafe, pushAll, pushMeeting } from './cloud/sync'
import { createToken, listTokens, revokeToken, MCP_URL } from './cloud/remote'
import { restartToUpdate } from './updater'
import { exportMeeting, type ExportKind } from './export'
import type { AuthUser, RemoteToken } from '@shared/types'

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}

// Sessione di cattura attiva: i segmenti live di sessioni diverse vengono ignorati
// (evita che il backlog di una call finita "sanguini" nella successiva).
let activeSession: string | null = null

// Canali IPC. Naming: dominio:azione (BUILD-SPEC §6.2).
export function registerIpc(): void {
  const sidecar = getSidecar()

  // segmenti LIVE: mostra solo quelli della sessione attiva (display provvisorio)
  sidecar.onSegment((s) => {
    if (s.meetingId !== activeSession) return
    broadcast('session:segment', s)
  })
  sidecar.onStatus((s) => broadcast('session:status', s))
  sidecar.onError((message, fatal) => broadcast('session:error', { message, fatal }))

  // transcript FINALE (pass di qualità): è l'autoritativo → persiste e rimpiazza.
  sidecar.onFinal((meetingId, segments) => {
    replaceSegments(meetingId, segments)
    const detail = getMeeting(meetingId)
    reindexMeeting(meetingId, {
      transcript: segments.map((s) => s.text).join(' '),
      raw: detail?.rawNotes?.contentMd ?? undefined
    })
    setMeetingStatus(meetingId, 'ready')
    broadcast('meetings:updated', meetingId)

    // enhancement automatico in background (se key + fondi appunti attivi)
    const settings = loadSettings()
    if (settings.mergeNotes && hasOpenAIKey() && segments.length > 0) {
      setMeetingStatus(meetingId, 'enhancing')
      broadcast('meetings:updated', meetingId)
      enhanceMeeting(meetingId)
        .catch((e) => console.error('[enhance] auto fallito:', e))
        .finally(() => {
          broadcast('meetings:updated', meetingId)
          syncMeetingSafe(meetingId) // sync dopo le note enhanced
        })
    } else {
      syncMeetingSafe(meetingId) // niente enhancement: sync del solo transcript
    }
  })

  // --- auth (Supabase, Fase 1) ---
  ipcMain.handle('auth:signUp', async (_e, email: string, password: string): Promise<AuthUser | null> =>
    signUp(email, password)
  )
  ipcMain.handle('auth:signIn', async (_e, email: string, password: string): Promise<AuthUser | null> =>
    signIn(email, password)
  )
  ipcMain.handle('auth:signOut', async (): Promise<void> => signOut())
  ipcMain.handle('auth:current', async (): Promise<AuthUser | null> => currentUser())

  // --- sync (desktop → cloud) ---
  ipcMain.handle('sync:meeting', async (_e, id: string): Promise<void> => pushMeeting(id))
  ipcMain.handle('sync:all', async (): Promise<{ ok: number; failed: number; error?: string }> => pushAll())

  // --- accesso remoto (MCP token) ---
  ipcMain.handle('remote:createToken', async (_e, name: string): Promise<{ token: string; url: string }> =>
    createToken(name)
  )
  ipcMain.handle('remote:listTokens', async (): Promise<RemoteToken[]> => listTokens())
  ipcMain.handle('remote:revoke', async (_e, id: string): Promise<void> => revokeToken(id))
  ipcMain.handle('remote:url', async (): Promise<string> => MCP_URL)

  // --- auto-update ---
  ipcMain.handle('update:restart', async (): Promise<void> => restartToUpdate())

  // --- devices (sidecar) ---
  ipcMain.handle('devices:list', async (): Promise<DeviceList> => sidecar.listDevices())

  // --- session ---
  ipcMain.handle('session:start', async (_e, opts: StartSessionOptions) => {
    const settings = loadSettings()
    const now = Date.now()
    const title =
      opts.title?.trim() ||
      `Registrazione ${new Date(now).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}`
    const meetingId = createMeeting({
      title,
      templateId: opts.templateId ?? null,
      language: opts.language ?? settings.language,
      status: 'recording',
      startedAt: now
    })
    await sidecar.start({
      sessionId: meetingId,
      sttModel: settings.sttModel,
      language: opts.language ?? settings.language,
      micIndex: opts.micIndex ?? settings.micIndex,
      loopbackIndex: opts.loopbackIndex ?? settings.loopbackIndex
    })
    activeSession = meetingId
    return { meetingId }
  })
  ipcMain.handle('session:stop', async (_e, meetingId: string): Promise<void> => {
    // non blocca la UI: il sidecar fa il pass finale e invia l'evento `final`
    // (gestito sopra) che persiste il transcript autoritativo e avvia l'enhancement.
    activeSession = null
    setMeetingStatus(meetingId, 'transcribing')
    broadcast('meetings:updated', meetingId)
    sidecar.stop(meetingId)
  })

  // --- meetings ---
  ipcMain.handle('meetings:list', async (_e, filter?: { q?: string }): Promise<MeetingListItem[]> =>
    listMeetings(filter)
  )
  ipcMain.handle('meetings:get', async (_e, id: string): Promise<MeetingDetail | null> =>
    getMeeting(id)
  )
  ipcMain.handle('meetings:saveRawNotes', async (_e, id: string, md: string): Promise<void> => {
    saveRawNotes(id, md)
    syncMeetingSafe(id)
  })
  ipcMain.handle('meetings:enhance', async (_e, id: string): Promise<void> => {
    try {
      await enhanceMeeting(id)
    } finally {
      broadcast('meetings:updated', id)
    }
  })
  ipcMain.handle('meetings:rename', async (_e, id: string, title: string): Promise<void> => {
    const t = title.trim()
    if (!t) return
    renameMeeting(id, t)
    broadcast('meetings:updated', id)
    syncMeetingSafe(id)
  })
  ipcMain.handle('meetings:remove', async (_e, id: string): Promise<void> => {
    removeMeeting(id)
    broadcast('meetings:updated', id)
    deleteMeetingCloudSafe(id)
  })
  ipcMain.handle(
    'meetings:export',
    async (e, id: string, kind: ExportKind): Promise<{ saved: boolean }> =>
      exportMeeting(BrowserWindow.fromWebContents(e.sender), id, kind)
  )

  // --- search ---
  ipcMain.handle('search:query', async (_e, q: string): Promise<SearchResult[]> =>
    searchFullText(q)
  )

  // --- ask ---
  ipcMain.handle('ask:meeting', async (_e, id: string, question: string): Promise<string> =>
    askMeeting(id, question)
  )
  ipcMain.handle('ask:global', async (_e, question: string) => askGlobal(question))

  // --- templates ---
  ipcMain.handle('templates:list', async (): Promise<Template[]> => {
    const rows = getDb()
      .prepare('SELECT * FROM templates ORDER BY name')
      .all() as Array<{
      id: string
      name: string
      type: string | null
      prompt: string
      structure: string | null
      created_at: number
      updated_at: number
    }>
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      prompt: r.prompt,
      structure: r.structure,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }))
  })
  ipcMain.handle(
    'templates:upsert',
    async (_e, _t: Partial<Template> & { name: string; prompt: string }): Promise<void> => {
      throw new Error('Template manager non ancora implementato (Fase 1).')
    }
  )

  // --- settings ---
  ipcMain.handle('settings:get', async (): Promise<Settings> => {
    const s = loadSettings()
    return { ...s, hasOpenAIKey: hasOpenAIKey() }
  })
  ipcMain.handle('settings:setOpenAIKey', async (_e, key: string): Promise<void> => {
    setOpenAIKey(key)
  })
  ipcMain.handle('settings:set', async (_e, partial: Partial<Settings>): Promise<void> => {
    const { hasOpenAIKey: _omit, ...rest } = partial
    saveSettings(rest)
  })
}
