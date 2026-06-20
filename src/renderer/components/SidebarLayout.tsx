import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SearchResult } from '@shared/types'
import TerminalTopbar from './TerminalTopbar'
import MeetingsSidebar from './MeetingsSidebar'
import NavCluster from './NavCluster'
import { useMeetings } from '../lib/useMeetings'

interface Props {
  selectedId?: string
  children: ReactNode
}

/** Shell con topbar + sidebar riunioni; usato da Home e Meeting. */
export default function SidebarLayout({ selectedId, children }: Props) {
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const { meetings } = useMeetings()

  // ricerca full-text (FTS + titoli) con debounce quando c'è testo
  useEffect(() => {
    const q = search.trim()
    if (!q) {
      setResults(null)
      return
    }
    const t = setTimeout(() => {
      window.scribio.search.query(q).then(setResults)
    }, 180)
    return () => clearTimeout(t)
  }, [search])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' }}>
      <TerminalTopbar right={<NavCluster />} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <MeetingsSidebar
          meetings={meetings}
          results={results}
          selectedId={selectedId}
          search={search}
          onSearch={setSearch}
          onSelect={(id) => nav(`/meeting/${id}`)}
          onDelete={(id) => {
            if (!window.confirm('Eliminare questa riunione? L’azione non è reversibile.')) return
            void window.scribio.meetings.remove(id)
            if (id === selectedId) nav('/')
          }}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-0)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
