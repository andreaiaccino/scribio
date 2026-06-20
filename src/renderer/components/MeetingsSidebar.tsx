import { useMemo, useState } from 'react'
import type { MeetingListItem as MItem, SearchResult } from '@shared/types'
import { groupByDate, hhmm, listTimeLabel, longDate, templateTag } from '../lib/format'
import { GroupLabel } from './primitives'

const KIND_LABEL: Record<SearchResult['kind'], string> = {
  enhanced: 'note',
  transcript: 'transcript',
  raw: 'appunti',
  title: 'titolo'
}

function SearchResultRow({ r, onClick }: { r: SearchResult; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: '10px 12px', borderRadius: 9, marginBottom: 3, cursor: 'pointer' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {r.title}
        </span>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--tx-11)', border: '1px solid var(--hair-07)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
          {KIND_LABEL[r.kind]}
        </span>
      </div>
      {r.snippet && (
        <div style={{ fontSize: 11.5, color: 'var(--tx-9)', lineHeight: 1.45, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {r.snippet}
        </div>
      )}
      <div className="mono" style={{ fontSize: 10, color: 'var(--tx-11)', marginTop: 4 }}>
        {longDate(r.startedAt)} · {hhmm(r.startedAt)}
      </div>
    </div>
  )
}

interface RowProps {
  item: MItem
  group: string
  selected: boolean
  onClick: () => void
  onDelete: () => void
}

function MeetingRow({ item, group, selected, onClick, onDelete }: RowProps) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        padding: '11px 12px 11px 13px',
        borderRadius: 9,
        background: selected ? 'var(--lime-06)' : hover ? 'rgba(255,255,255,0.03)' : 'transparent',
        marginBottom: 3,
        cursor: 'pointer'
      }}
    >
      {(hover || selected) && (
        <button
          title="Elimina riunione"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 24,
            height: 24,
            display: hover ? 'flex' : 'none',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-4)',
            border: '1px solid var(--hair-08)',
            borderRadius: 6,
            cursor: 'pointer',
            padding: 0
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 4.5h10M6.5 4.5V3.2c0-.4.3-.7.7-.7h1.6c.4 0 .7.3.7.7v1.3M5 4.5l.5 8c0 .4.3.7.7.7h3.6c.4 0 .7-.3.7-.7l.5-8"
              stroke="#c46"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      {selected && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 11,
            bottom: 11,
            width: 2,
            borderRadius: 2,
            background: 'var(--lime)'
          }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: selected ? 'var(--lime)' : '#333',
            flexShrink: 0
          }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: selected ? 550 : 500,
            color: selected ? 'var(--tx-1)' : 'var(--tx-6)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {item.title}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingLeft: 13 }}>
        <span className="mono" style={{ fontSize: 11, color: selected ? 'var(--tx-8)' : 'var(--tx-10)' }}>
          {listTimeLabel(group, item.startedAt)}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: selected ? '#9a9a9a' : 'var(--tx-10)',
            border: `1px solid ${selected ? 'var(--hair-10)' : 'var(--hair-07)'}`,
            borderRadius: 4,
            padding: '1px 6px'
          }}
        >
          {templateTag(item.templateName)}
        </span>
      </div>
    </div>
  )
}

interface Props {
  meetings: MItem[]
  results: SearchResult[] | null
  selectedId?: string
  search: string
  onSearch: (v: string) => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

export default function MeetingsSidebar({ meetings, results, selectedId, search, onSearch, onSelect, onDelete }: Props) {
  const groups = useMemo(() => groupByDate(meetings), [meetings])
  const searching = search.trim().length > 0

  return (
    <div
      style={{
        width: 284,
        flexShrink: 0,
        borderRight: '1px solid var(--hair)',
        background: 'var(--bg-1)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0
      }}
    >
      <div style={{ padding: '16px 16px 12px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            height: 38,
            padding: '0 12px',
            background: 'var(--bg-4)',
            border: '1px solid var(--hair-07)',
            borderRadius: 9
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="#6A6A6A" strokeWidth="1.4" />
            <path d="M11 11l3 3" stroke="#6A6A6A" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Cerca riunioni…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 13,
              color: 'var(--tx-3)'
            }}
          />
          <span
            className="mono"
            style={{
              fontSize: 10,
              color: 'var(--tx-12)',
              border: '1px solid var(--hair-08)',
              borderRadius: 4,
              padding: '1px 5px'
            }}
          >
            ⌘K
          </span>
        </div>
      </div>

      <div className="scroll-y" style={{ flex: 1, padding: '4px 10px 16px' }}>
        {searching ? (
          <>
            <GroupLabel>{results ? `${results.length} risultati` : 'Ricerca…'}</GroupLabel>
            {results && results.length === 0 && (
              <div style={{ padding: '12px 8px', fontSize: 13, color: 'var(--tx-10)' }}>
                Nessun risultato per “{search.trim()}”.
              </div>
            )}
            {results?.map((r) => (
              <SearchResultRow key={`${r.meetingId}-${r.kind}`} r={r} onClick={() => onSelect(r.meetingId)} />
            ))}
          </>
        ) : (
          <>
            {groups.length === 0 && (
              <div style={{ padding: '20px 8px', fontSize: 13, color: 'var(--tx-10)' }}>
                Nessuna riunione.
              </div>
            )}
            {groups.map((g) => (
              <div key={g.label}>
                <GroupLabel>{g.label}</GroupLabel>
                {g.items.map((m) => (
                  <MeetingRow
                    key={m.id}
                    item={m}
                    group={g.label}
                    selected={m.id === selectedId}
                    onClick={() => onSelect(m.id)}
                    onDelete={() => onDelete(m.id)}
                  />
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
