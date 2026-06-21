import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AskResult } from '@shared/types'
import SidebarLayout from '../components/SidebarLayout'
import { SectionLabel } from '../components/primitives'
import { useMeetings } from '../lib/useMeetings'
import { hhmm, longDate, templateTag } from '../lib/format'

function GlobalAsk() {
  const nav = useNavigate()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<AskResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const q = value.trim()
    if (!q || busy) return
    setBusy(true)
    setError(null)
    setRes(null)
    try {
      setRes(await window.scribio.ask.global(q))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 40 }}>
      <SectionLabel color="var(--lime)">Chiedi a tutte le riunioni</SectionLabel>
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          height: 48,
          padding: '0 8px 0 18px',
          background: 'var(--bg-3)',
          border: '1px solid var(--hair-09)',
          borderRadius: 12
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="#5A5A5A" strokeWidth="1.3" />
          <path d="M11 11l3 3" stroke="#5A5A5A" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder="Es. cosa ha detto Alfonso sui permessi?"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--tx-3)' }}
        />
        <button
          onClick={() => void submit()}
          disabled={busy}
          style={{
            width: 34,
            height: 34,
            border: 'none',
            borderRadius: 9,
            background: 'var(--lime)',
            opacity: busy ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: busy ? 'default' : 'pointer'
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 13 L8 3 M3.5 7.5 L8 3 L12.5 7.5" stroke="#0A0A0A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {(busy || res || error) && (
        <div style={{ marginTop: 12, padding: '14px 16px', background: 'var(--bg-2)', border: '1px solid var(--hair-07)', borderRadius: 12 }}>
          {busy && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--tx-7)', fontSize: 13.5 }}>
              <span className="sc-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--lime)' }} />
              Sto cercando tra le riunioni…
            </div>
          )}
          {error && <div style={{ fontSize: 13, color: '#e89' }}>{error}</div>}
          {res && (
            <>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--tx-3)', whiteSpace: 'pre-wrap' }}>{res.answer}</div>
              {res.sources.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {res.sources.map((s) => (
                    <span
                      key={s.meetingId}
                      onClick={() => nav(`/meeting/${s.meetingId}`)}
                      className="mono"
                      style={{ fontSize: 11, color: 'var(--tx-8)', border: '1px solid var(--hair-08)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
                    >
                      {s.title}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const nav = useNavigate()
  const { meetings } = useMeetings()
  const recent = meetings.slice(0, 5)

  // primo avvio: se la configurazione guidata non è stata completata, vai all'onboarding
  useEffect(() => {
    void window.scribio.settings.get().then((s) => {
      if (!s.onboarded) nav('/onboarding', { replace: true })
    })
  }, [nav])

  return (
    <SidebarLayout>
      <div className="scroll-y" style={{ flex: 1 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '64px 40px 40px' }}>
          <SectionLabel color="var(--lime)">Scribio</SectionLabel>
          <h1 style={{ margin: '14px 0 0', fontSize: 34, fontWeight: 600, color: 'var(--tx-bright)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Pronto a registrare.
          </h1>
          <p style={{ margin: '12px 0 0', fontSize: 14.5, color: 'var(--tx-9)', lineHeight: 1.6, maxWidth: 520 }}>
            Avvia una registrazione: Scribio cattura l'audio in locale, trascrive in tempo reale e
            fonde i tuoi appunti con il transcript in note enhanced.
          </p>

          <button
            onClick={() => nav('/live')}
            style={{
              marginTop: 28,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              height: 44,
              padding: '0 22px',
              background: 'var(--lime)',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              fontSize: 14.5,
              fontWeight: 600,
              color: '#0a0a0a'
            }}
          >
            <span className="sc-pulse" style={{ width: 9, height: 9, borderRadius: '50%', background: '#0a0a0a' }} />
            Nuova registrazione
          </button>

          <GlobalAsk />

          {recent.length > 0 && (
            <div style={{ marginTop: 56 }}>
              <SectionLabel>Riunioni recenti</SectionLabel>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}>
                {recent.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => nav(`/meeting/${m.id}`)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '14px 4px',
                      borderTop: '1px solid var(--hair)',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#333', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14, color: 'var(--tx-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.title}
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--tx-10)', border: '1px solid var(--hair-07)', borderRadius: 4, padding: '1px 6px' }}>
                      {templateTag(m.templateName)}
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--tx-10)', width: 150, textAlign: 'right' }}>
                      {longDate(m.startedAt)} · {hhmm(m.startedAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  )
}
