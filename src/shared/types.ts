// Tipi condivisi tra main, preload, renderer e (concettualmente) sidecar.
// Riferimento: BUILD-SPEC §5 (schema), §6 (contratti IPC).

export type MeetingStatus =
  | 'recording'
  | 'transcribing'
  | 'enhancing'
  | 'ready'
  | 'error'

export type Speaker = 'me' | 'others'

export interface Meeting {
  id: string
  title: string
  templateId: string | null
  language: string
  status: MeetingStatus
  startedAt: number // epoch ms
  endedAt: number | null
  participants: string[]
  consentFlag: boolean
  createdAt: number
  updatedAt: number
}

export interface TranscriptSegment {
  id: string
  meetingId: string
  speaker: Speaker
  tsStart: number // secondi dall'inizio
  tsEnd: number | null
  text: string
  seq: number
}

export interface RawNotes {
  meetingId: string
  contentMd: string
  updatedAt: number
}

export interface EnhancedNotes {
  meetingId: string
  contentMd: string
  summary: string | null
  model: string | null
  createdAt: number
}

export interface Template {
  id: string
  name: string
  type: string | null
  prompt: string
  structure: string | null
  createdAt: number
  updatedAt: number
}

// --- liste / dettagli per la UI ---
export interface MeetingListItem {
  id: string
  title: string
  status: MeetingStatus
  startedAt: number
  templateName: string | null
}

export interface MeetingDetail extends Meeting {
  rawNotes: RawNotes | null
  enhancedNotes: EnhancedNotes | null
  segments: TranscriptSegment[]
  templateName: string | null
  // messaggio dell'ultimo enhancement fallito (transiente, solo se status === 'error')
  enhanceError?: string
}

export interface SearchResult {
  meetingId: string
  title: string
  kind: 'enhanced' | 'transcript' | 'raw' | 'title'
  snippet: string
  startedAt: number
}

// --- sessione di registrazione ---
export interface StartSessionOptions {
  title: string
  templateId?: string | null
  sttModel?: string
  language?: string
  micIndex?: number
  loopbackIndex?: number
}

export interface SessionStatus {
  meetingId: string
  state: 'capturing' | 'finalizing'
}

// --- device audio ---
export interface AudioDevice {
  index: number
  name: string
}
export interface DeviceList {
  mic: AudioDevice[]
  loopback: AudioDevice[]
}

// livello audio per il VU-meter dell'onboarding (probe)
export interface AudioLevel {
  speaker: Speaker
  rms: number
}

// --- settings ---
export type NoteStyle = 'concise' | 'balanced' | 'detailed'
export interface Settings {
  hasOpenAIKey: boolean
  openAIModel: string
  sttModel: string
  language: string
  micIndex: number | null
  loopbackIndex: number | null
  speakerLabels: boolean
  mergeNotes: boolean
  noteStyle: NoteStyle
  onboarded: boolean
  version: string
}

// --- auth / cloud (Fase 1) ---
export interface AuthUser {
  id: string
  email: string
}

export interface AskResult {
  answer: string
  sources: Array<{ meetingId: string; title: string }>
}

export interface RemoteToken {
  id: string
  name: string | null
  createdAt: string
  lastUsedAt: string | null
}

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'none' }
  | { state: 'progress'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

export type Unsubscribe = () => void

// API esposta al renderer via preload/contextBridge (BUILD-SPEC §6.2).
export interface ScribioApi {
  auth: {
    signUp(email: string, password: string): Promise<AuthUser | null>
    signIn(email: string, password: string): Promise<AuthUser | null>
    signOut(): Promise<void>
    current(): Promise<AuthUser | null>
  }
  sync: {
    meeting(id: string): Promise<void>
    all(): Promise<{ ok: number; failed: number; error?: string }>
  }
  remote: {
    createToken(name: string): Promise<{ token: string; url: string }>
    listTokens(): Promise<RemoteToken[]>
    revoke(id: string): Promise<void>
    url(): Promise<string>
  }
  updates: {
    onStatus(cb: (s: UpdateStatus) => void): Unsubscribe
    restart(): Promise<void>
  }
  devices: {
    list(): Promise<DeviceList>
  }
  audio: {
    probeStart(opts: { micIndex?: number | null; loopbackIndex?: number | null }): Promise<void>
    probeStop(): Promise<void>
    onLevel(cb: (l: AudioLevel) => void): Unsubscribe
  }
  session: {
    start(opts: StartSessionOptions): Promise<{ meetingId: string }>
    stop(meetingId: string): Promise<void>
    onSegment(cb: (s: TranscriptSegment) => void): Unsubscribe
    onStatus(cb: (s: SessionStatus) => void): Unsubscribe
  }
  meetings: {
    list(filter?: { q?: string }): Promise<MeetingListItem[]>
    get(id: string): Promise<MeetingDetail | null>
    saveRawNotes(id: string, md: string): Promise<void>
    enhance(id: string, templateId?: string): Promise<void>
    rename(id: string, title: string): Promise<void>
    remove(id: string): Promise<void>
    export(id: string, kind: 'transcript' | 'notes'): Promise<{ saved: boolean }>
    onUpdated(cb: (meetingId: string) => void): Unsubscribe
  }
  search: {
    query(q: string): Promise<SearchResult[]>
  }
  ask: {
    meeting(id: string, question: string): Promise<string>
    global(question: string): Promise<AskResult>
  }
  templates: {
    list(): Promise<Template[]>
    upsert(t: Partial<Template> & { name: string; prompt: string }): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    setOpenAIKey(key: string): Promise<void>
    set(partial: Partial<Settings>): Promise<void>
  }
}
