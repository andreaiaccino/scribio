import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { NoteStyle } from '@shared/types'

// Preferenze non sensibili (la API key sta in secrets.ts/safeStorage).
export interface StoredSettings {
  openAIModel: string
  sttModel: string
  language: string
  micIndex: number | null
  loopbackIndex: number | null
  speakerLabels: boolean
  mergeNotes: boolean
  noteStyle: NoteStyle
  onboarded: boolean
}

const DEFAULTS: StoredSettings = {
  openAIModel: 'gpt-5-mini',
  sttModel: 'medium', // bloccato: modello STT scelto da noi (non esposto in UI)
  language: 'it',
  micIndex: null,
  loopbackIndex: null,
  speakerLabels: true,
  mergeNotes: true,
  noteStyle: 'balanced',
  onboarded: false
}

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): StoredSettings {
  const f = file()
  if (!existsSync(f)) return { ...DEFAULTS }
  try {
    return { ...DEFAULTS, ...(JSON.parse(readFileSync(f, 'utf-8')) as Partial<StoredSettings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(partial: Partial<StoredSettings>): StoredSettings {
  const next = { ...loadSettings(), ...partial }
  writeFileSync(file(), JSON.stringify(next, null, 2))
  return next
}
