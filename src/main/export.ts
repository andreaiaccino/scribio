import { writeFile } from 'node:fs/promises'
import { app, dialog, type BrowserWindow } from 'electron'
import type { MeetingDetail } from '@shared/types'
import { getMeeting } from './db/repositories'

export type ExportKind = 'transcript' | 'notes'

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function header(detail: MeetingDetail): string {
  const d = new Date(detail.startedAt)
  const date = d.toLocaleString('it-IT', { dateStyle: 'full', timeStyle: 'short' })
  const dur = detail.endedAt ? ` · ${Math.round((detail.endedAt - detail.startedAt) / 60000)} min` : ''
  return `${date}${dur}`
}

function transcriptLines(detail: MeetingDetail): string {
  if (detail.segments.length === 0) return '(nessun segmento)'
  return detail.segments
    .map((s) => `[${mmss(s.tsStart)}] ${s.speaker === 'me' ? 'Tu' : 'Altri'}: ${s.text}`)
    .join('\n')
}

export function buildTranscriptTxt(detail: MeetingDetail): string {
  return `${detail.title}\n${header(detail)}\n\n${transcriptLines(detail)}\n`
}

export function buildNotesMd(detail: MeetingDetail): string {
  const parts: string[] = [`# ${detail.title}`, '', `_${header(detail)}_`, '']
  if (detail.enhancedNotes?.summary) {
    parts.push('## Sommario', '', detail.enhancedNotes.summary, '')
  }
  if (detail.enhancedNotes?.contentMd) {
    parts.push(detail.enhancedNotes.contentMd, '')
  }
  if (detail.rawNotes?.contentMd?.trim()) {
    parts.push('## Appunti', '', detail.rawNotes.contentMd, '')
  }
  parts.push('## Transcript', '', transcriptLines(detail), '')
  return parts.join('\n')
}

function safeName(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'riunione'
}

export async function exportMeeting(
  win: BrowserWindow | null,
  id: string,
  kind: ExportKind
): Promise<{ saved: boolean }> {
  const detail = getMeeting(id)
  if (!detail) throw new Error('Riunione non trovata.')

  const ext = kind === 'transcript' ? 'txt' : 'md'
  const content = kind === 'transcript' ? buildTranscriptTxt(detail) : buildNotesMd(detail)
  const day = new Date(detail.startedAt).toISOString().slice(0, 10)
  const suffix = kind === 'transcript' ? 'transcript' : 'note'
  const defaultName = `Scribio - ${safeName(detail.title)} - ${day} - ${suffix}.${ext}`

  const opts = {
    defaultPath: `${app.getPath('downloads')}/${defaultName}`,
    filters: [
      { name: kind === 'transcript' ? 'Testo' : 'Markdown', extensions: [ext] },
      { name: 'Tutti i file', extensions: ['*'] }
    ]
  }
  const res = win
    ? await dialog.showSaveDialog(win, opts)
    : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return { saved: false }

  await writeFile(res.filePath, content, 'utf-8')
  return { saved: true }
}
