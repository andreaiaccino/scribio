// Edge Function: server MCP (JSON-RPC su HTTP) per consumer remoti (Hermes).
// Auth: bearer token → hash → lookup api_tokens (service role) → owner_id.
// Tools: search_meetings, get_meeting, list_meetings. Isolamento per-owner manuale.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { cors, json } from '../_shared/cors.ts'

declare const Supabase: { ai: { Session: new (m: string) => { run(input: string, opts: Record<string, unknown>): Promise<number[]> } } }
declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Promise<Response>): void }

const PROTOCOL_VERSION = '2024-11-05'

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

async function ownerFromToken(req: Request, sb: SupabaseClient): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const hash = await sha256Hex(token)
  const { data } = await sb.from('api_tokens').select('id,owner_id').eq('token_hash', hash).maybeSingle()
  if (!data) return null
  void sb.from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
  return data.owner_id as string
}

const TOOLS = [
  {
    name: 'search_meetings',
    description: 'Cerca semanticamente tra le riunioni dell’utente e ritorna gli estratti più pertinenti.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'La domanda o le parole chiave.' },
        limit: { type: 'number', description: 'Numero di estratti (default 8).' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_meeting',
    description: 'Ritorna note enhanced, summary e transcript di una riunione per id.',
    inputSchema: {
      type: 'object',
      properties: { meeting_id: { type: 'string' } },
      required: ['meeting_id']
    }
  },
  {
    name: 'list_meetings',
    description: 'Elenca le riunioni più recenti dell’utente (titolo, data, id).',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Default 20.' } }
    }
  }
]

function textResult(text: string) {
  return { content: [{ type: 'text', text }] }
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  owner: string,
  sb: SupabaseClient
): Promise<{ content: Array<{ type: string; text: string }> }> {
  if (name === 'search_meetings') {
    const query = String(args.query ?? '')
    const limit = Number(args.limit ?? 8)
    const session = new Supabase.ai.Session('gte-small')
    const embedding = await session.run(query, { mean_pool: true, normalize: true })
    const { data, error } = await sb.rpc('match_embeddings_for', {
      owner,
      query_embedding: embedding,
      match_count: limit
    })
    if (error) return textResult(`Errore ricerca: ${error.message}`)
    const rows = (data ?? []) as Array<{ meeting_id: string; kind: string; content: string; similarity: number }>
    if (rows.length === 0) return textResult('Nessun risultato.')
    const ids = [...new Set(rows.map((r) => r.meeting_id))]
    const { data: mts } = await sb.from('meetings').select('id,title').in('id', ids)
    const titles = new Map((mts ?? []).map((m: { id: string; title: string }) => [m.id, m.title]))
    const text = rows
      .map((r, i) => `[${i + 1}] ${titles.get(r.meeting_id) ?? r.meeting_id} (${r.kind}, ${r.similarity.toFixed(2)}):\n${r.content}`)
      .join('\n\n')
    return textResult(text)
  }

  if (name === 'get_meeting') {
    const id = String(args.meeting_id ?? '')
    const { data: m } = await sb.from('meetings').select('*').eq('id', id).eq('owner_id', owner).maybeSingle()
    if (!m) return textResult('Riunione non trovata.')
    const { data: enh } = await sb.from('enhanced_notes').select('content_md,summary').eq('meeting_id', id).maybeSingle()
    const { data: segs } = await sb.from('transcript_segments').select('speaker,ts_start,text').eq('meeting_id', id).order('seq')
    const transcript = (segs ?? [])
      .map((s: { speaker: string; text: string }) => `${s.speaker === 'me' ? 'Tu' : 'Altri'}: ${s.text}`)
      .join('\n')
    const parts = [`# ${m.title}`, `Data: ${m.started_at}`]
    if (enh?.summary) parts.push(`\n## Summary\n${enh.summary}`)
    if (enh?.content_md) parts.push(`\n## Note\n${enh.content_md}`)
    if (transcript) parts.push(`\n## Transcript\n${transcript}`)
    return textResult(parts.join('\n'))
  }

  if (name === 'list_meetings') {
    const limit = Number(args.limit ?? 20)
    const { data } = await sb
      .from('meetings')
      .select('id,title,started_at,status')
      .eq('owner_id', owner)
      .order('started_at', { ascending: false })
      .limit(limit)
    const rows = (data ?? []) as Array<{ id: string; title: string; started_at: string; status: string }>
    if (rows.length === 0) return textResult('Nessuna riunione.')
    return textResult(rows.map((r) => `- ${r.title} — ${r.started_at} [${r.status}] (id: ${r.id})`).join('\n'))
  }

  return textResult(`Tool sconosciuto: ${name}`)
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const sb = admin()
  const owner = await ownerFromToken(req, sb)
  if (!owner) return new Response('Unauthorized', { status: 401, headers: cors })

  let msg: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> }
  try {
    msg = await req.json()
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
  }

  const { id, method, params } = msg
  const reply = (result: unknown): Response => json({ jsonrpc: '2.0', id, result })

  try {
    if (method === 'initialize') {
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'scribio', version: '0.1.0' }
      })
    }
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
      return new Response(null, { status: 202, headers: cors })
    }
    if (method === 'ping') return reply({})
    if (method === 'tools/list') return reply({ tools: TOOLS })
    if (method === 'tools/call') {
      const name = String(params?.name ?? '')
      const args = (params?.arguments ?? {}) as Record<string, unknown>
      const result = await callTool(name, args, owner, sb)
      return reply(result)
    }
    return json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
  } catch (e) {
    return json({ jsonrpc: '2.0', id, error: { code: -32603, message: String(e) } })
  }
})
