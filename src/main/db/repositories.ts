import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import { getDb } from './db'
import type {
  EnhancedNotes,
  Meeting,
  MeetingDetail,
  MeetingListItem,
  MeetingStatus,
  RawNotes,
  Speaker,
  Template,
  TranscriptSegment
} from '@shared/types'

// --------------------------------------------------------------------------- //
// Row types (snake_case come in SQLite) + mappers
// --------------------------------------------------------------------------- //
interface MeetingRow {
  id: string
  title: string
  template_id: string | null
  language: string
  status: MeetingStatus
  started_at: number
  ended_at: number | null
  participants: string | null
  consent_flag: number
  created_at: number
  updated_at: number
}

function mapMeeting(r: MeetingRow): Meeting {
  return {
    id: r.id,
    title: r.title,
    templateId: r.template_id,
    language: r.language,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    participants: r.participants ? (JSON.parse(r.participants) as string[]) : [],
    consentFlag: !!r.consent_flag,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

// --------------------------------------------------------------------------- //
// Meetings
// --------------------------------------------------------------------------- //
export function listMeetings(filter?: { q?: string }): MeetingListItem[] {
  const db = getDb()
  const q = filter?.q?.trim()
  const rows = (
    q
      ? db
          .prepare(
            `SELECT m.id, m.title, m.status, m.started_at, t.name AS template_name
             FROM meetings m LEFT JOIN templates t ON t.id = m.template_id
             WHERE m.title LIKE ? ORDER BY m.started_at DESC`
          )
          .all(`%${q}%`)
      : db
          .prepare(
            `SELECT m.id, m.title, m.status, m.started_at, t.name AS template_name
             FROM meetings m LEFT JOIN templates t ON t.id = m.template_id
             ORDER BY m.started_at DESC`
          )
          .all()
  ) as Array<{
    id: string
    title: string
    status: MeetingStatus
    started_at: number
    template_name: string | null
  }>

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    startedAt: r.started_at,
    templateName: r.template_name
  }))
}

export function getMeeting(id: string): MeetingDetail | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as
    | MeetingRow
    | undefined
  if (!row) return null
  const meeting = mapMeeting(row)

  const templateName = row.template_id
    ? ((
        db.prepare('SELECT name FROM templates WHERE id = ?').get(row.template_id) as
          | { name: string }
          | undefined
      )?.name ?? null)
    : null

  const segRows = db
    .prepare(
      'SELECT * FROM transcript_segments WHERE meeting_id = ? ORDER BY seq ASC'
    )
    .all(id) as Array<{
    id: string
    meeting_id: string
    speaker: Speaker
    ts_start: number
    ts_end: number | null
    text: string
    seq: number
  }>
  const segments: TranscriptSegment[] = segRows.map((s) => ({
    id: s.id,
    meetingId: s.meeting_id,
    speaker: s.speaker,
    tsStart: s.ts_start,
    tsEnd: s.ts_end,
    text: s.text,
    seq: s.seq
  }))

  const rawRow = db
    .prepare('SELECT * FROM raw_notes WHERE meeting_id = ?')
    .get(id) as { meeting_id: string; content_md: string; updated_at: number } | undefined
  const rawNotes: RawNotes | null = rawRow
    ? { meetingId: rawRow.meeting_id, contentMd: rawRow.content_md, updatedAt: rawRow.updated_at }
    : null

  const enhRow = db
    .prepare('SELECT * FROM enhanced_notes WHERE meeting_id = ?')
    .get(id) as
    | { meeting_id: string; content_md: string; summary: string | null; model: string | null; created_at: number }
    | undefined
  const enhancedNotes: EnhancedNotes | null = enhRow
    ? {
        meetingId: enhRow.meeting_id,
        contentMd: enhRow.content_md,
        summary: enhRow.summary,
        model: enhRow.model,
        createdAt: enhRow.created_at
      }
    : null

  return { ...meeting, templateName, rawNotes, enhancedNotes, segments }
}

export function createMeeting(
  fields: Pick<Meeting, 'title' | 'templateId' | 'language' | 'status' | 'startedAt'>
): string {
  const db = getDb()
  const id = uuid()
  const now = Date.now()
  db.prepare(
    `INSERT INTO meetings
       (id, title, template_id, language, status, started_at, ended_at,
        participants, consent_flag, created_at, updated_at)
     VALUES (@id, @title, @template_id, @language, @status, @started_at, NULL,
        '[]', 0, @now, @now)`
  ).run({
    id,
    title: fields.title,
    template_id: fields.templateId,
    language: fields.language,
    status: fields.status,
    started_at: fields.startedAt,
    now
  })
  return id
}

export function insertSegments(meetingId: string, segments: TranscriptSegment[]): void {
  if (segments.length === 0) return
  const db = getDb()
  const ins = db.prepare(
    `INSERT OR REPLACE INTO transcript_segments
       (id, meeting_id, speaker, ts_start, ts_end, text, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  const tx = db.transaction((segs: TranscriptSegment[]) => {
    for (const s of segs) {
      ins.run(s.id, meetingId, s.speaker, s.tsStart, s.tsEnd, s.text, s.seq)
    }
  })
  tx(segments)
}

/** Sostituisce tutti i segmenti di una riunione (pass finale). */
export function replaceSegments(meetingId: string, segments: TranscriptSegment[]): void {
  const db = getDb()
  const del = db.prepare('DELETE FROM transcript_segments WHERE meeting_id = ?')
  const ins = db.prepare(
    `INSERT OR REPLACE INTO transcript_segments
       (id, meeting_id, speaker, ts_start, ts_end, text, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  const tx = db.transaction((segs: TranscriptSegment[]) => {
    del.run(meetingId)
    for (const s of segs) {
      ins.run(s.id, meetingId, s.speaker, s.tsStart, s.tsEnd, s.text, s.seq)
    }
  })
  tx(segments)
}

export function setMeetingStatus(id: string, status: MeetingStatus): void {
  getDb()
    .prepare('UPDATE meetings SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, Date.now(), id)
}

export function saveRawNotes(meetingId: string, md: string): void {
  const db = getDb()
  const now = Date.now()
  db.prepare(
    `INSERT INTO raw_notes (meeting_id, content_md, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(meeting_id) DO UPDATE SET content_md = excluded.content_md,
       updated_at = excluded.updated_at`
  ).run(meetingId, md, now)
}

export function renameMeeting(id: string, title: string): void {
  getDb()
    .prepare('UPDATE meetings SET title = ?, updated_at = ? WHERE id = ?')
    .run(title, Date.now(), id)
}

export function removeMeeting(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM search_index WHERE meeting_id = ?').run(id)
  db.prepare('DELETE FROM meetings WHERE id = ?').run(id)
}

// --------------------------------------------------------------------------- //
// Templates
// --------------------------------------------------------------------------- //
export function getTemplate(id: string): Template | null {
  const r = getDb().prepare('SELECT * FROM templates WHERE id = ?').get(id) as
    | {
        id: string
        name: string
        type: string | null
        prompt: string
        structure: string | null
        created_at: number
        updated_at: number
      }
    | undefined
  if (!r) return null
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    prompt: r.prompt,
    structure: r.structure,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

// --------------------------------------------------------------------------- //
// Enhanced notes (M4)
// --------------------------------------------------------------------------- //
export function saveEnhancedNotes(
  meetingId: string,
  contentMd: string,
  summary: string,
  model: string
): void {
  getDb()
    .prepare(
      `INSERT INTO enhanced_notes (meeting_id, content_md, summary, model, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(meeting_id) DO UPDATE SET
         content_md = excluded.content_md, summary = excluded.summary,
         model = excluded.model, created_at = excluded.created_at`
    )
    .run(meetingId, contentMd, summary, model, Date.now())
}

// --------------------------------------------------------------------------- //
// Full-text search (FTS5)
// --------------------------------------------------------------------------- //
export function reindexMeeting(
  meetingId: string,
  parts: { enhanced?: string; transcript?: string; raw?: string }
): void {
  const db = getDb()
  db.prepare('DELETE FROM search_index WHERE meeting_id = ?').run(meetingId)
  const ins = db.prepare(
    'INSERT INTO search_index (meeting_id, kind, content) VALUES (?, ?, ?)'
  )
  if (parts.enhanced) ins.run(meetingId, 'enhanced', parts.enhanced)
  if (parts.transcript) ins.run(meetingId, 'transcript', parts.transcript)
  if (parts.raw) ins.run(meetingId, 'raw', parts.raw)
}

export function searchFullText(q: string): import('@shared/types').SearchResult[] {
  const term = q.trim()
  if (!term) return []
  const db = getDb()
  // match FTS sicuro: quoting per evitare errori di sintassi su token speciali.
  const ftsQuery = `"${term.replace(/"/g, '""')}"*`
  const rows = db
    .prepare(
      `SELECT s.meeting_id, s.kind,
              snippet(search_index, 2, '[', ']', '…', 10) AS snippet,
              m.title, m.started_at
       FROM search_index s JOIN meetings m ON m.id = s.meeting_id
       WHERE search_index MATCH ?
       ORDER BY m.started_at DESC LIMIT 50`
    )
    .all(ftsQuery) as Array<{
    meeting_id: string
    kind: 'enhanced' | 'transcript' | 'raw'
    snippet: string
    title: string
    started_at: number
  }>
  const results: import('@shared/types').SearchResult[] = rows.map((r) => ({
    meetingId: r.meeting_id,
    title: r.title,
    kind: r.kind,
    snippet: r.snippet,
    startedAt: r.started_at
  }))

  // include anche i match sul titolo (non indicizzati in FTS), senza duplicare
  const seen = new Set(results.map((r) => r.meetingId))
  const titleRows = db
    .prepare(
      `SELECT id, title, started_at FROM meetings
       WHERE title LIKE ? ORDER BY started_at DESC LIMIT 50`
    )
    .all(`%${term}%`) as Array<{ id: string; title: string; started_at: number }>
  for (const r of titleRows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    results.push({ meetingId: r.id, title: r.title, kind: 'title', snippet: '', startedAt: r.started_at })
  }
  return results
}

// --------------------------------------------------------------------------- //
// Demo seed (M1): popola un set realistico coerente col mockup, se vuoto.
// --------------------------------------------------------------------------- //
export function seedDemoIfEmpty(db: Database.Database): void {
  const count = db.prepare('SELECT COUNT(*) AS n FROM meetings').get() as { n: number }
  if (count.n > 0) return
  void uuid // (i seed usano id stabili per la demo)

  const day = 86_400_000
  const now = Date.now()
  const at = (offsetDays: number, h: number, m: number): number => {
    const d = new Date(now - offsetDays * day)
    d.setHours(h, m, 0, 0)
    return d.getTime()
  }

  const insMeeting = db.prepare(
    `INSERT INTO meetings
       (id, title, template_id, language, status, started_at, ended_at,
        participants, consent_flag, created_at, updated_at)
     VALUES (@id,@title,@template_id,'it','ready',@started_at,@ended_at,
        @participants,1,@now,@now)`
  )

  const meetingsSeed = [
    { id: 'm-alfonso', title: 'Call discovery — Alfonso Selva', template_id: 'tpl-vendita', started_at: at(0, 9, 30), ended_at: at(0, 10, 5), participants: JSON.stringify(['Alfonso Selva', 'Giulia Rossi (Tu)', 'Marco Terzi']) },
    { id: 'm-standup', title: 'Standup di prodotto', template_id: 'tpl-generica', started_at: at(0, 11, 0), ended_at: at(0, 11, 20), participants: JSON.stringify(['Team']) },
    { id: 'm-marta', title: '1:1 con Marta', template_id: 'tpl-generica', started_at: at(0, 15, 30), ended_at: at(0, 16, 0), participants: JSON.stringify(['Marta', 'Tu']) },
    { id: 'm-roadmap', title: 'Review roadmap Q3', template_id: 'tpl-generica', started_at: at(1, 14, 0), ended_at: at(1, 15, 0), participants: JSON.stringify(['Team Prodotto']) },
    { id: 'm-nexa', title: 'Onboarding cliente Nexa', template_id: 'tpl-vendita', started_at: at(1, 16, 15), ended_at: at(1, 17, 0), participants: JSON.stringify(['Nexa', 'Tu']) },
    { id: 'm-retro', title: 'Retrospettiva sprint 24', template_id: 'tpl-generica', started_at: at(4, 10, 0), ended_at: at(4, 10, 45), participants: JSON.stringify(['Team']) },
    { id: 'm-mkt', title: 'Sync marketing', template_id: 'tpl-generica', started_at: at(3, 11, 0), ended_at: at(3, 11, 30), participants: JSON.stringify(['Marketing']) }
  ]
  for (const m of meetingsSeed) insMeeting.run({ ...m, now })

  // dettaglio ricco solo per la riunione in evidenza (Alfonso)
  db.prepare(
    `INSERT INTO enhanced_notes (meeting_id, content_md, summary, model, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    'm-alfonso',
    [
      '## Contesto',
      "- Alfonso guida l'area Operations in Nexa (≈120 persone) e valuta una soluzione per ridurre il lavoro manuale di reportistica.",
      '- Oggi usano fogli condivisi e un tool legacy: i processi non sono standardizzati tra i team.',
      '',
      '## Pain point emersi',
      '- Troppo tempo speso a consolidare i dati a mano a fine mese — circa **2 giorni/persona**.',
      '- Scarsa tracciabilità: difficile capire chi ha modificato cosa e quando.',
      "- Onboarding dei nuovi membri lento per l'assenza di documentazione condivisa.",
      '',
      '## Esigenze chiave',
      '- Automazione del consolidamento ed export programmati.',
      '- Permessi granulari e log completo delle modifiche.',
      '- Integrazione con gli strumenti esistenti — Slack e Google Drive.'
    ].join('\n'),
    'Alfonso (Ops Nexa, ~120 persone) cerca di ridurre il lavoro manuale di reportistica di fine mese. Forte interesse su automazione, permessi/log e integrazioni Slack/Drive. Prossimo passo: proposta tier Team e demo tecnica.',
    'demo',
    now
  )

  db.prepare(
    `INSERT INTO raw_notes (meeting_id, content_md, updated_at) VALUES (?, ?, ?)`
  ).run(
    'm-alfonso',
    [
      'alfonso → ops nexa, ~120 persone',
      'problema = reportistica manuale, 2gg/mese!!',
      'vogliono permessi + log modifiche',
      'chiede self-hosting (sicurezza)',
      'integraz. slack + drive',
      '',
      '// da fare',
      '- mandare proposta (team tier)',
      '- demo tecnica?? con marco',
      '- case study retail'
    ].join('\n'),
    now
  )

  const insSeg = db.prepare(
    `INSERT INTO transcript_segments (id, meeting_id, speaker, ts_start, ts_end, text, seq)
     VALUES (@id,'m-alfonso',@speaker,@start,@end,@text,@seq)`
  )
  const segs: Array<{ speaker: Speaker; start: number; text: string }> = [
    { speaker: 'others', start: 60, text: 'Diciamo che il nostro problema più grosso è la reportistica di fine mese, è tutto fatto a mano.' },
    { speaker: 'me', start: 90, text: 'Capito. E quante persone sono coinvolte in quel processo ogni mese?' },
    { speaker: 'others', start: 120, text: 'Almeno quattro, e ci vanno via un paio di giorni a testa. È insostenibile.' }
  ]
  segs.forEach((s, i) =>
    insSeg.run({ id: `seg-${i}`, speaker: s.speaker, start: s.start, end: s.start + 8, text: s.text, seq: i })
  )

  // indice FTS per la riunione demo
  const insIdx = db.prepare(
    'INSERT INTO search_index (meeting_id, kind, content) VALUES (?, ?, ?)'
  )
  const enhContent =
    (db.prepare('SELECT content_md FROM enhanced_notes WHERE meeting_id = ?').get('m-alfonso') as { content_md: string }).content_md
  insIdx.run('m-alfonso', 'enhanced', enhContent)
  insIdx.run('m-alfonso', 'transcript', segs.map((s) => s.text).join(' '))
}
