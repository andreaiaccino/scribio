import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSecret, setSecret, clearSecret } from '../secrets'

// Config PUBBLICA del progetto Supabase (URL + publishable key): per design non
// sono segreti, possono stare nel bundle. Service role / secret key NON vivono
// mai nel desktop (solo nelle Edge Functions).
export const SUPABASE_URL = 'https://jmkekxajljwiukorswaj.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_AAW3kb4f_IkCMWLPVj8lAQ_nImi6S-k'

// La sessione (access + refresh token) è persistita CIFRATA via safeStorage,
// in un unico blob. Adapter sincrono compatibile con l'auth storage di supabase-js.
const SESSION_SECRET = 'supabase.session'
const mem = new Map<string, string>()

const encryptedStorage = {
  getItem(key: string): string | null {
    if (mem.has(key)) return mem.get(key) ?? null
    const raw = getSecret(SESSION_SECRET)
    if (!raw) return null
    try {
      const obj = JSON.parse(raw) as Record<string, string>
      for (const [k, v] of Object.entries(obj)) mem.set(k, v)
      return mem.get(key) ?? null
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    mem.set(key, value)
    setSecret(SESSION_SECRET, JSON.stringify(Object.fromEntries(mem)))
  },
  removeItem(key: string): void {
    mem.delete(key)
    if (mem.size === 0) clearSecret(SESSION_SECRET)
    else setSecret(SESSION_SECRET, JSON.stringify(Object.fromEntries(mem)))
  }
}

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: encryptedStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    })
  }
  return client
}
