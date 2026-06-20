import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

// Segreti cifrati con lo storage sicuro dell'OS (Windows Credential Manager via
// safeStorage) e salvati come blob su disco. MAI in chiaro nel DB, nei log o nei
// config (BUILD-SPEC §10, PRD §7.4).

function secretFile(name: string): string {
  return join(app.getPath('userData'), `${name}.enc`)
}

/** Salva un segreto cifrato (o lo cancella se vuoto). */
export function setSecret(name: string, value: string): void {
  if (!value) {
    clearSecret(name)
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Storage sicuro non disponibile su questo sistema.')
  }
  writeFileSync(secretFile(name), safeStorage.encryptString(value))
}

export function getSecret(name: string): string | null {
  const f = secretFile(name)
  if (!existsSync(f)) return null
  try {
    return safeStorage.decryptString(readFileSync(f))
  } catch {
    return null
  }
}

export function hasSecret(name: string): boolean {
  return existsSync(secretFile(name))
}

export function clearSecret(name: string): void {
  const f = secretFile(name)
  if (existsSync(f)) rmSync(f)
}

// --- OpenAI API key (BYOK) ------------------------------------------------- //
const OPENAI_KEY = 'openai.key'
export function setOpenAIKey(key: string): void {
  setSecret(OPENAI_KEY, key)
}
export function getOpenAIKey(): string | null {
  return getSecret(OPENAI_KEY)
}
export function hasOpenAIKey(): boolean {
  return hasSecret(OPENAI_KEY)
}
export function clearOpenAIKey(): void {
  clearSecret(OPENAI_KEY)
}
