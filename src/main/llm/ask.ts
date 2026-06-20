import type { AskResult, MeetingDetail } from '@shared/types'
import { getMeeting, listMeetings } from '../db/repositories'
import { getOpenAIKey } from '../secrets'
import { loadSettings } from '../store'
import { getSupabase } from '../cloud/supabase'
import { OpenAIProvider } from './openai'
import { MissingApiKeyError } from './enhance'

const SYSTEM_PROMPT = `Sei l'assistente di Scribio. Rispondi alla domanda dell'utente basandoti
ESCLUSIVAMENTE sul contenuto della riunione fornito (note enhanced, appunti, transcript).
Se l'informazione non è presente nel materiale, dillo chiaramente invece di inventare.
Rispondi in italiano, in modo conciso e diretto.`

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function buildContext(detail: MeetingDetail): string {
  const parts: string[] = []
  if (detail.enhancedNotes?.contentMd) parts.push(`NOTE ENHANCED:\n${detail.enhancedNotes.contentMd}`)
  if (detail.rawNotes?.contentMd?.trim()) parts.push(`APPUNTI GREZZI:\n${detail.rawNotes.contentMd}`)
  if (detail.segments.length > 0) {
    const transcript = detail.segments
      .map((s) => `[${mmss(s.tsStart)}] ${s.speaker === 'me' ? 'Tu' : 'Altri'}: ${s.text}`)
      .join('\n')
    parts.push(`TRANSCRIPT:\n${transcript}`)
  }
  return parts.join('\n\n') || '(nessun contenuto disponibile per questa riunione)'
}

/** Q&A su una singola riunione (BUILD-SPEC M5 / RF-UI-4). */
export async function askMeeting(meetingId: string, question: string): Promise<string> {
  const detail = getMeeting(meetingId)
  if (!detail) throw new Error('Riunione non trovata.')

  const key = getOpenAIKey()
  if (!key) throw new MissingApiKeyError()

  const settings = loadSettings()
  const provider = new OpenAIProvider(key, settings.openAIModel)

  const userPrompt = `RIUNIONE: "${detail.title}"\n\n${buildContext(detail)}\n\nDOMANDA: ${question}`
  return provider.ask({ systemPrompt: SYSTEM_PROMPT, userPrompt })
}

const GLOBAL_SYSTEM = `Sei l'assistente di Scribio. Rispondi alla domanda basandoti ESCLUSIVAMENTE
sugli estratti delle riunioni forniti (possono provenire da riunioni diverse). Se l'informazione non
c'è, dillo invece di inventare. Cita tra parentesi quadre il numero dell'estratto quando utile.
Rispondi in italiano, conciso e diretto.`

interface SearchChunk {
  meeting_id: string
  kind: string
  content: string
  similarity: number
}

/** Ask globale (RAG su tutte le riunioni dell'utente): cerca i chunk nel cloud
 *  (gte-small) e fa il reasoning con OpenAI locale. */
export async function askGlobal(question: string): Promise<AskResult> {
  const key = getOpenAIKey()
  if (!key) throw new MissingApiKeyError()

  const { data, error } = await getSupabase().functions.invoke('search-meetings', {
    body: { query: question, match_count: 8 }
  })
  if (error) throw new Error(error.message)
  const results = ((data as { results?: SearchChunk[] } | null)?.results ?? []) as SearchChunk[]
  if (results.length === 0) {
    return { answer: 'Non ho trovato nulla nelle tue riunioni su questo argomento.', sources: [] }
  }

  const titles = new Map(listMeetings().map((m) => [m.id, m.title]))
  const context = results
    .map((r, i) => `[${i + 1}] (${titles.get(r.meeting_id) ?? 'Riunione'}): ${r.content}`)
    .join('\n\n')

  const provider = new OpenAIProvider(key, loadSettings().openAIModel)
  const answer = await provider.ask({
    systemPrompt: GLOBAL_SYSTEM,
    userPrompt: `ESTRATTI DALLE RIUNIONI:\n${context}\n\nDOMANDA: ${question}`
  })

  const seen = new Set<string>()
  const sources: AskResult['sources'] = []
  for (const r of results) {
    if (seen.has(r.meeting_id)) continue
    seen.add(r.meeting_id)
    sources.push({ meetingId: r.meeting_id, title: titles.get(r.meeting_id) ?? 'Riunione' })
  }
  return { answer, sources }
}
