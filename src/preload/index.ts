import { contextBridge, ipcRenderer } from 'electron'
import type {
  AskResult,
  AudioLevel,
  AuthUser,
  DeviceList,
  RemoteToken,
  UpdateStatus,
  MeetingDetail,
  MeetingListItem,
  ScribioApi,
  SearchResult,
  SessionStatus,
  Settings,
  StartSessionOptions,
  Template,
  TranscriptSegment,
  Unsubscribe
} from '@shared/types'

const api: ScribioApi = {
  auth: {
    signUp: (email: string, password: string): Promise<AuthUser | null> =>
      ipcRenderer.invoke('auth:signUp', email, password),
    signIn: (email: string, password: string): Promise<AuthUser | null> =>
      ipcRenderer.invoke('auth:signIn', email, password),
    signOut: (): Promise<void> => ipcRenderer.invoke('auth:signOut'),
    current: (): Promise<AuthUser | null> => ipcRenderer.invoke('auth:current')
  },
  sync: {
    meeting: (id: string): Promise<void> => ipcRenderer.invoke('sync:meeting', id),
    all: (): Promise<{ ok: number; failed: number; error?: string }> => ipcRenderer.invoke('sync:all')
  },
  remote: {
    createToken: (name: string): Promise<{ token: string; url: string }> =>
      ipcRenderer.invoke('remote:createToken', name),
    listTokens: (): Promise<RemoteToken[]> => ipcRenderer.invoke('remote:listTokens'),
    revoke: (id: string): Promise<void> => ipcRenderer.invoke('remote:revoke', id),
    url: (): Promise<string> => ipcRenderer.invoke('remote:url')
  },
  updates: {
    onStatus: (cb: (s: UpdateStatus) => void): Unsubscribe => {
      const listener = (_e: unknown, s: UpdateStatus): void => cb(s)
      ipcRenderer.on('update:status', listener)
      return () => ipcRenderer.removeListener('update:status', listener)
    },
    restart: (): Promise<void> => ipcRenderer.invoke('update:restart')
  },
  devices: {
    list: (): Promise<DeviceList> => ipcRenderer.invoke('devices:list')
  },
  audio: {
    probeStart: (opts: { micIndex?: number | null; loopbackIndex?: number | null }): Promise<void> =>
      ipcRenderer.invoke('audio:probeStart', opts),
    probeStop: (): Promise<void> => ipcRenderer.invoke('audio:probeStop'),
    onLevel: (cb: (l: AudioLevel) => void): Unsubscribe => {
      const listener = (_e: unknown, l: AudioLevel): void => cb(l)
      ipcRenderer.on('audio:level', listener)
      return () => ipcRenderer.removeListener('audio:level', listener)
    }
  },
  session: {
    start: (opts: StartSessionOptions): Promise<{ meetingId: string }> =>
      ipcRenderer.invoke('session:start', opts),
    stop: (meetingId: string): Promise<void> =>
      ipcRenderer.invoke('session:stop', meetingId),
    onSegment: (cb: (s: TranscriptSegment) => void): Unsubscribe => {
      const listener = (_e: unknown, s: TranscriptSegment): void => cb(s)
      ipcRenderer.on('session:segment', listener)
      return () => ipcRenderer.removeListener('session:segment', listener)
    },
    onStatus: (cb: (s: SessionStatus) => void): Unsubscribe => {
      const listener = (_e: unknown, s: SessionStatus): void => cb(s)
      ipcRenderer.on('session:status', listener)
      return () => ipcRenderer.removeListener('session:status', listener)
    }
  },
  meetings: {
    list: (filter?: { q?: string }): Promise<MeetingListItem[]> =>
      ipcRenderer.invoke('meetings:list', filter),
    get: (id: string): Promise<MeetingDetail | null> =>
      ipcRenderer.invoke('meetings:get', id),
    saveRawNotes: (id: string, md: string): Promise<void> =>
      ipcRenderer.invoke('meetings:saveRawNotes', id, md),
    enhance: (id: string, templateId?: string): Promise<void> =>
      ipcRenderer.invoke('meetings:enhance', id, templateId),
    rename: (id: string, title: string): Promise<void> =>
      ipcRenderer.invoke('meetings:rename', id, title),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('meetings:remove', id),
    export: (id: string, kind: 'transcript' | 'notes'): Promise<{ saved: boolean }> =>
      ipcRenderer.invoke('meetings:export', id, kind),
    onUpdated: (cb: (meetingId: string) => void): Unsubscribe => {
      const listener = (_e: unknown, id: string): void => cb(id)
      ipcRenderer.on('meetings:updated', listener)
      return () => ipcRenderer.removeListener('meetings:updated', listener)
    }
  },
  search: {
    query: (q: string): Promise<SearchResult[]> => ipcRenderer.invoke('search:query', q)
  },
  ask: {
    meeting: (id: string, question: string): Promise<string> =>
      ipcRenderer.invoke('ask:meeting', id, question),
    global: (question: string): Promise<AskResult> => ipcRenderer.invoke('ask:global', question)
  },
  templates: {
    list: (): Promise<Template[]> => ipcRenderer.invoke('templates:list'),
    upsert: (t: Partial<Template> & { name: string; prompt: string }): Promise<void> =>
      ipcRenderer.invoke('templates:upsert', t)
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    setOpenAIKey: (key: string): Promise<void> =>
      ipcRenderer.invoke('settings:setOpenAIKey', key),
    set: (partial: Partial<Settings>): Promise<void> =>
      ipcRenderer.invoke('settings:set', partial)
  }
}

contextBridge.exposeInMainWorld('scribio', api)
