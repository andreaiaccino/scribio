import type { MeetingDetail, NoteStyle, Template } from '@shared/types'
import {
  getMeeting,
  getTemplate,
  reindexMeeting,
  saveEnhancedNotes,
  setMeetingStatus
} from '../db/repositories'
import { getOpenAIKey } from '../secrets'
import { loadSettings } from '../store'
import { OpenAIProvider } from './openai'

export class MissingApiKeyError extends Error {
  constructor() {
    super('API key OpenAI non configurata. Inseriscila nelle Impostazioni.')
    this.name = 'MissingApiKeyError'
  }
}

const STYLE_HINT: Record<NoteStyle, string> = {
  concise: 'Sii molto conciso: solo i bullet essenziali, frasi brevi.',
  balanced: 'Mantieni una densità bilanciata: completo ma asciutto.',
  detailed: 'Sii dettagliato e completo, senza però inventare nulla.'
}

// System prompt (BUILD-SPEC §7.1).
function buildSystemPrompt(style: NoteStyle): string {
  return `Sei l'assistente di note di riunione di Scribio. Ricevi gli APPUNTI GREZZI presi a mano
dall'utente durante una riunione e il TRANSCRIPT completo (con speaker "Tu" = chi prende
appunti e "Altri" = gli altri partecipanti). Il tuo compito è produrre note finali pulite
e strutturate.

REGOLE FONDAMENTALI:
- Gli appunti grezzi dell'utente sono l'ÀNCORA: rispetta la loro struttura, i loro temi e
  il loro ordine. Non li stravolgere. Li arricchisci e li completi usando il transcript.
- Riempi i buchi e aggiungi dettaglio SOLO sulla base del transcript. NON inventare nulla,
  non aggiungere fatti non presenti né nelle note né nel transcript.
- Se un punto degli appunti non trova riscontro nel transcript, mantienilo comunque ma non
  inventarci sopra.
- Scrivi in italiano, in modo asciutto e professionale. Niente fronzoli, niente preamboli.
- Produci un SUMMARY di 2-4 frasi che catturi gli esiti e le decisioni chiave.

${STYLE_HINT[style]}

FORMATO DI OUTPUT: la struttura dei campi (enhanced_md, summary) è imposta dallo schema a
livello di API. Concentrati sulla qualità: enhanced_md deve seguire la struttura del
template e degli appunti; summary 2-4 frasi.`
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// User message composto a runtime (BUILD-SPEC §7.2).
function buildUserPrompt(detail: MeetingDetail, template: Template | null): string {
  const structure = template?.structure || 'struttura libera, segui gli appunti dell’utente'
  const templatePrompt = template?.prompt ? `\n${template.prompt}` : ''
  const raw = detail.rawNotes?.contentMd?.trim() || '(nessun appunto)'
  const transcript =
    detail.segments
      .map((s) => `[${mmss(s.tsStart)}] ${s.speaker === 'me' ? 'Tu' : 'Altri'}: ${s.text}`)
      .join('\n') || '(transcript vuoto)'
  const started = new Date(detail.startedAt).toLocaleString('it-IT')
  const durMin = detail.endedAt ? Math.round((detail.endedAt - detail.startedAt) / 60000) : null

  return `TEMPLATE (struttura attesa della nota):
${structure}${templatePrompt}

APPUNTI GREZZI DELL'UTENTE:
${raw}

TRANSCRIPT:
${transcript}

METADATI: titolo="${detail.title}", data="${started}", durata="${durMin ?? '—'} min"`
}

/** Orchestrazione enhancement: detail+template → OpenAI → salva note+summary. */
export async function enhanceMeeting(meetingId: string): Promise<void> {
  const detail = getMeeting(meetingId)
  if (!detail) throw new Error('Riunione non trovata.')

  const key = getOpenAIKey()
  if (!key) throw new MissingApiKeyError()

  const settings = loadSettings()
  const template = detail.templateId ? getTemplate(detail.templateId) : null
  const provider = new OpenAIProvider(key, settings.openAIModel)

  setMeetingStatus(meetingId, 'enhancing')
  try {
    const res = await provider.enhance({
      systemPrompt: buildSystemPrompt(settings.noteStyle),
      userPrompt: buildUserPrompt(detail, template)
    })
    saveEnhancedNotes(meetingId, res.enhancedMd, res.summary, settings.openAIModel)
    reindexMeeting(meetingId, {
      enhanced: res.enhancedMd,
      transcript: detail.segments.map((s) => s.text).join(' '),
      raw: detail.rawNotes?.contentMd ?? undefined
    })
    setMeetingStatus(meetingId, 'ready')
  } catch (e) {
    setMeetingStatus(meetingId, 'error')
    throw e
  }
}
