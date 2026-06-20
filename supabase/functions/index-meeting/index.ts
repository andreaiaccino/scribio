// Edge Function: genera gli embeddings (gte-small, 384) di una riunione.
// Invocata dal desktop dopo il sync. Usa l'Authorization dell'utente → RLS.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, json } from '../_shared/cors.ts'

// globali del runtime Edge
declare const Supabase: { ai: { Session: new (m: string) => { run(input: string, opts: Record<string, unknown>): Promise<number[]> } } }
declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Promise<Response>): void }

const CHUNK_WORDS = 220
const OVERLAP = 40

function chunk(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const out: string[] = []
  for (let i = 0; i < words.length; i += CHUNK_WORDS - OVERLAP) {
    out.push(words.slice(i, i + CHUNK_WORDS).join(' '))
    if (i + CHUNK_WORDS >= words.length) break
  }
  return out
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { meeting_id } = (await req.json()) as { meeting_id?: string }
    if (!meeting_id) return json({ error: 'meeting_id mancante' }, 400)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )

    const sources: { kind: string; text: string }[] = []
    const enh = await sb.from('enhanced_notes').select('content_md,summary').eq('meeting_id', meeting_id).maybeSingle()
    if (enh.data?.content_md) {
      sources.push({ kind: 'enhanced', text: (enh.data.summary ? enh.data.summary + '\n' : '') + enh.data.content_md })
    }
    const raw = await sb.from('raw_notes').select('content_md').eq('meeting_id', meeting_id).maybeSingle()
    if (raw.data?.content_md?.trim()) sources.push({ kind: 'raw', text: raw.data.content_md })
    const segs = await sb.from('transcript_segments').select('text').eq('meeting_id', meeting_id).order('seq')
    const tr = (segs.data ?? []).map((s: { text: string }) => s.text).join(' ')
    if (tr.trim()) sources.push({ kind: 'transcript', text: tr })

    const session = new Supabase.ai.Session('gte-small')
    const rows: Array<{ meeting_id: string; kind: string; content: string; embedding: number[] }> = []
    for (const src of sources) {
      for (const c of chunk(src.text)) {
        const embedding = await session.run(c, { mean_pool: true, normalize: true })
        rows.push({ meeting_id, kind: src.kind, content: c, embedding })
      }
    }

    await sb.from('embeddings').delete().eq('meeting_id', meeting_id)
    if (rows.length > 0) {
      const { error } = await sb.from('embeddings').insert(rows)
      if (error) return json({ error: error.message }, 500)
    }
    return json({ count: rows.length })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
