import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TranscriptSegment } from '@shared/types'
import TerminalTopbar from '../components/TerminalTopbar'
import { SectionLabel } from '../components/primitives'
import { clock } from '../lib/format'

function RecordingCluster({ elapsed, onStop }: { elapsed: number; onStop: () => void }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span className="sc-pulse" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--lime)' }} />
        <SectionLabel color="var(--tx-7)" style={{ letterSpacing: '0.08em' }}>
          Registrazione
        </SectionLabel>
      </div>
      <span className="mono" style={{ fontSize: 15, fontWeight: 500, color: 'var(--tx-1)', letterSpacing: '0.02em' }}>
        {clock(elapsed)}
      </span>
      <button
        onClick={onStop}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 34,
          padding: '0 16px',
          background: 'var(--bg-5)',
          border: '1px solid var(--hair-16)',
          borderRadius: 9,
          cursor: 'pointer'
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--tx-1)' }} />
        <span style={{ fontSize: 13, fontWeight: 550, color: 'var(--tx-1)' }}>Termina</span>
      </button>
    </>
  )
}

export default function Live() {
  const nav = useNavigate()
  const [elapsed, setElapsed] = useState(0)
  const [notes, setNotes] = useState('')
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [error, setError] = useState<string | null>(null)
  const meetingIdRef = useRef<string | null>(null)
  const startedRef = useRef(false)
  const stoppingRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // avvio sessione + sottoscrizione segmenti.
  // startedRef sopravvive al doppio-mount di StrictMode (stesso fiber) → un solo start.
  useEffect(() => {
    const offSeg = window.scribio.session.onSegment((s) => setSegments((prev) => [...prev, s]))
    if (!startedRef.current) {
      startedRef.current = true
      window.scribio.session
        .start({ title: '' })
        .then(({ meetingId }) => {
          meetingIdRef.current = meetingId
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    }
    return () => offSeg()
  }, [])

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [segments])

  const stop = async () => {
    if (stoppingRef.current) return
    stoppingRef.current = true
    const id = meetingIdRef.current
    try {
      if (id) {
        if (notes.trim()) await window.scribio.meetings.saveRawNotes(id, notes)
        await window.scribio.session.stop(id)
        nav(`/meeting/${id}`)
        return
      }
    } catch {
      /* ignora: navigo comunque */
    }
    nav('/')
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' }}>
      <TerminalTopbar height={52} right={<RecordingCluster elapsed={elapsed} onStop={() => void stop()} />} />

      {error && (
        <div style={{ padding: '10px 32px', background: 'rgba(255,80,80,0.08)', borderBottom: '1px solid rgba(255,80,80,0.2)', color: '#e89', fontSize: 13 }}>
          Cattura non avviata: {error}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* notepad */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--hair)' }}>
          <div style={{ padding: '18px 32px 12px', flexShrink: 0 }}>
            <SectionLabel>I miei appunti</SectionLabel>
          </div>
          <div className="scroll-y" style={{ flex: 1, padding: '8px 32px 32px' }}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Scrivi i tuoi appunti…"
              autoFocus
              style={{
                width: '100%',
                maxWidth: 560,
                minHeight: '60vh',
                resize: 'none',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 15.5,
                lineHeight: 1.9,
                color: 'var(--tx-3)'
              }}
            />
          </div>
        </div>

        {/* live transcript */}
        <div style={{ width: 520, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-1)', minHeight: 0 }}>
          <div style={{ padding: '18px 28px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
            <SectionLabel>Transcript live</SectionLabel>
            <span className="sc-pulse" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--lime)' }} />
          </div>
          <div ref={scrollRef} className="scroll-y" style={{ flex: 1, padding: '8px 28px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {segments.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--tx-10)', lineHeight: 1.6 }}>
                In ascolto… il transcript apparirà qui mentre parli.
              </div>
            )}
            {segments.map((s, i) => {
              const last = i === segments.length - 1
              const speakerColor = s.speaker === 'me' ? 'var(--lime)' : 'var(--tx-8)'
              const textColor = last ? 'var(--tx-2)' : s.speaker === 'me' ? '#c8c8c8' : 'var(--tx-7)'
              const wrap = last
                ? {
                    position: 'relative' as const,
                    padding: '12px 14px',
                    margin: '0 -14px',
                    borderRadius: 10,
                    background: 'var(--lime-05)',
                    border: '1px solid var(--lime-14)'
                  }
                : {}
              return (
                <div key={s.id} style={wrap}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span className="mono" style={{ fontSize: 11, color: speakerColor }}>
                      {s.speaker === 'me' ? 'Tu' : 'Altri'}
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--tx-12)' }}>
                      {clock(s.tsStart)}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, color: textColor }}>
                    {s.text}
                    {last && (
                      <span
                        className="sc-blink"
                        style={{ display: 'inline-block', width: 7, height: 14, background: 'var(--lime)', marginLeft: 3, transform: 'translateY(2px)' }}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
