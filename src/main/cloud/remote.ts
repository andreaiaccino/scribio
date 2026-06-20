import { randomBytes, createHash } from 'node:crypto'
import type { RemoteToken } from '@shared/types'
import { getSupabase, SUPABASE_URL } from './supabase'

// Accesso remoto via MCP: si genera un token in chiaro (mostrato una volta) e si
// salva nel cloud solo il suo hash sha256. La validazione avviene nell'Edge Function.
export const MCP_URL = `${SUPABASE_URL}/functions/v1/mcp`

export async function createToken(name: string): Promise<{ token: string; url: string }> {
  const token = 'scrib_' + randomBytes(24).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { error } = await getSupabase()
    .from('api_tokens')
    .insert({ name: name.trim() || 'token', token_hash: tokenHash })
  if (error) throw new Error(error.message)
  return { token, url: MCP_URL }
}

export async function listTokens(): Promise<RemoteToken[]> {
  const { data, error } = await getSupabase()
    .from('api_tokens')
    .select('id,name,created_at,last_used_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((t: { id: string; name: string | null; created_at: string; last_used_at: string | null }) => ({
    id: t.id,
    name: t.name,
    createdAt: t.created_at,
    lastUsedAt: t.last_used_at
  }))
}

export async function revokeToken(id: string): Promise<void> {
  const { error } = await getSupabase().from('api_tokens').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
