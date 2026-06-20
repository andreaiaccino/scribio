// Edge Function: ricerca semantica (gte-small + match_embeddings) sulle riunioni
// dell'utente autenticato. Ritorna i chunk top-k; il reasoning lo fa il chiamante.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, json } from '../_shared/cors.ts'

declare const Supabase: { ai: { Session: new (m: string) => { run(input: string, opts: Record<string, unknown>): Promise<number[]> } } }
declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Promise<Response>): void }

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { query, match_count } = (await req.json()) as { query?: string; match_count?: number }
    if (!query) return json({ error: 'query mancante' }, 400)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )

    const session = new Supabase.ai.Session('gte-small')
    const embedding = await session.run(query, { mean_pool: true, normalize: true })
    const { data, error } = await sb.rpc('match_embeddings', {
      query_embedding: embedding,
      match_count: match_count ?? 8
    })
    if (error) return json({ error: error.message }, 500)
    return json({ results: data })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
