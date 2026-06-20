import type { MeetingListItem } from '@shared/types'

const MONTHS = [
  'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
  'lug', 'ago', 'set', 'ott', 'nov', 'dic'
]
const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

export function hhmm(epoch: number): string {
  const d = new Date(epoch)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "mar 17 giu 2026" */
export function longDate(epoch: number): string {
  const d = new Date(epoch)
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function weekdayShort(epoch: number): string {
  return WEEKDAYS[new Date(epoch).getDay()]
}

export function durationLabel(startedAt: number, endedAt: number | null): string {
  if (!endedAt) return '—'
  const min = Math.round((endedAt - startedAt) / 60000)
  return `${min} min`
}

/** mm:ss da secondi */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function startOfDay(epoch: number): number {
  const d = new Date(epoch)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export type MeetingGroup = { label: string; items: MeetingListItem[] }

/** Raggruppa per Oggi / Ieri / Questa settimana / Più vecchie (come nel mockup). */
export function groupByDate(items: MeetingListItem[]): MeetingGroup[] {
  const day = 86_400_000
  const today = startOfDay(Date.now())
  const groups: Record<string, MeetingListItem[]> = {
    Oggi: [],
    Ieri: [],
    'Questa settimana': [],
    'Più vecchie': []
  }
  for (const m of items) {
    const d = startOfDay(m.startedAt)
    if (d === today) groups['Oggi'].push(m)
    else if (d === today - day) groups['Ieri'].push(m)
    else if (d > today - 7 * day) groups['Questa settimana'].push(m)
    else groups['Più vecchie'].push(m)
  }
  return Object.entries(groups)
    .filter(([, v]) => v.length > 0)
    .map(([label, list]) => ({ label, items: list }))
}

/** etichetta breve usata nella riga lista: orario o giorno della settimana */
export function listTimeLabel(group: string, epoch: number): string {
  return group === 'Oggi' || group === 'Ieri' ? hhmm(epoch) : weekdayShort(epoch)
}

/** mappa templateName → tag breve mostrato in lista (come nel mockup) */
export function templateTag(name: string | null): string {
  if (!name) return '—'
  if (/vendita|discovery/i.test(name)) return 'Call vendita'
  return name
}

export function initials(name: string): string {
  const clean = name.replace(/\(.*?\)/g, '').trim()
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
