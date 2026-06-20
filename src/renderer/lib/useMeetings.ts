import { useCallback, useEffect, useState } from 'react'
import type { MeetingListItem } from '@shared/types'

/** Carica la lista riunioni (con filtro testo opzionale). */
export function useMeetings(query = '') {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.scribio.meetings.list(query ? { q: query } : undefined)
      setMeetings(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void reload()
  }, [reload])

  // aggiorna la lista quando una riunione cambia (fine registrazione, rinomina, elimina)
  useEffect(() => window.scribio.meetings.onUpdated(() => void reload()), [reload])

  return { meetings, loading, error, reload }
}
