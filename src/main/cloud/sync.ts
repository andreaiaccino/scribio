import { v5 as uuidv5 } from 'uuid'
import { getMeeting, getTemplate, listMeetings } from '../db/repositories'
import { getSupabase } from './supabase'
import { isAuthenticated } from './auth'

// Sync one-way desktop → cloud, solo TESTO (mai audio). Il desktop resta source of
// truth. RLS + owner_id (default auth.uid()) isolano i dati per utente.

// I template locali hanno id stringa fissi ('tpl-generica', …), non uuid → mappo a
// uuid v5 stabile per rispettare lo schema cloud (templates.id uuid).
const TEMPLATE_NS = '1b671a64-40d5-491e-99b0-da01ff1f3341'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(id: string): boolean {
  return UUID_RE.test(id)
}

/** Push completo di una riunione (meeting + segments + note). No-op se non loggato. */
export async function pushMeeting(id: string): Promise<void> {
  if (!isUuid(id)) return // riunioni demo (id non-uuid): non sincronizzate
  if (!(await isAuthenticated())) return
  const d = getMeeting(id)
  if (!d) return
  const sb = getSupabase()

  // template (opzionale): upsert con id mappato a uuid v5
  let templateId: string | null = null
  if (d.templateId) {
    const t = getTemplate(d.templateId)
    if (t) {
      templateId = uuidv5(t.id, TEMPLATE_NS)
      const { error } = await sb
        .from('templates')
        .upsert({ id: templateId, name: t.name, type: t.type, prompt: t.prompt, structure: t.structure })
      if (error) throw new Error(`templates: ${error.message}`)
    }
  }

  const { error: mErr } = await sb.from('meetings').upsert({
    id: d.id,
    title: d.title,
    template_id: templateId,
    language: d.language,
    status: d.status,
    started_at: new Date(d.startedAt).toISOString(),
    ended_at: d.endedAt ? new Date(d.endedAt).toISOString() : null,
    participants: d.participants,
    consent_flag: d.consentFlag
  })
  if (mErr) throw new Error(`meetings: ${mErr.message}`)

  // segmenti: replace (id cloud generati dal default; quelli locali non sono uuid)
  const { error: dErr } = await sb.from('transcript_segments').delete().eq('meeting_id', d.id)
  if (dErr) throw new Error(`segments delete: ${dErr.message}`)
  if (d.segments.length > 0) {
    const rows = d.segments.map((s) => ({
      meeting_id: d.id,
      speaker: s.speaker,
      ts_start: s.tsStart,
      ts_end: s.tsEnd,
      text: s.text,
      seq: s.seq
    }))
    const { error } = await sb.from('transcript_segments').insert(rows)
    if (error) throw new Error(`segments insert: ${error.message}`)
  }

  if (d.rawNotes) {
    const { error } = await sb
      .from('raw_notes')
      .upsert({ meeting_id: d.id, content_md: d.rawNotes.contentMd })
    if (error) throw new Error(`raw_notes: ${error.message}`)
  }

  if (d.enhancedNotes) {
    const { error } = await sb.from('enhanced_notes').upsert({
      meeting_id: d.id,
      content_md: d.enhancedNotes.contentMd,
      summary: d.enhancedNotes.summary,
      model: d.enhancedNotes.model
    })
    if (error) throw new Error(`enhanced_notes: ${error.message}`)
  }

  // (ri)genera gli embeddings lato Edge Function (gte-small). Fallimento non
  // fatale: il testo è già sincronizzato.
  try {
    const { error } = await sb.functions.invoke('index-meeting', { body: { meeting_id: d.id } })
    if (error) console.error('[sync] index-meeting:', error.message)
  } catch (e) {
    console.error('[sync] index-meeting:', e)
  }
}

export async function deleteMeetingCloud(id: string): Promise<void> {
  if (!isUuid(id)) return
  if (!(await isAuthenticated())) return
  const { error } = await getSupabase().from('meetings').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Best-effort: spinge tutte le riunioni locali (salta demo/errori). */
export async function pushAll(): Promise<{ ok: number; failed: number; error?: string }> {
  if (!(await isAuthenticated())) {
    return { ok: 0, failed: 0, error: 'Non autenticato (sessione cloud assente). Esci e rientra in Account.' }
  }
  let ok = 0
  let failed = 0
  let firstError: string | undefined
  const all = listMeetings()
  const real = all.filter((m) => isUuid(m.id))
  if (real.length === 0) {
    return { ok: 0, failed: 0, error: `Nessuna riunione sincronizzabile (${all.length} locali, tutte demo/non-uuid).` }
  }
  for (const m of real) {
    try {
      await pushMeeting(m.id)
      ok++
    } catch (e) {
      failed++
      const msg = e instanceof Error ? e.message : String(e)
      if (!firstError) firstError = msg
      console.error('[sync] push fallito', m.id, msg)
    }
  }
  return { ok, failed, error: firstError }
}

/** Wrapper non-bloccante per gli hook (log only). */
export function syncMeetingSafe(id: string): void {
  pushMeeting(id).catch((e) => console.error('[sync] pushMeeting', id, e))
}

export function deleteMeetingCloudSafe(id: string): void {
  deleteMeetingCloud(id).catch((e) => console.error('[sync] deleteMeeting', id, e))
}
