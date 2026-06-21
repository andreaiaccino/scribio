import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import type { MeetingDetail } from '@shared/types'
import SidebarLayout from '../components/SidebarLayout'
import { SectionLabel, SegmentedControl, Avatar } from '../components/primitives'
import { clock, durationLabel, hhmm, initials, longDate } from '../lib/format'

type Tab = 'enhanced' | 'mine'

// --- mini renderer markdown coerente col mockup (## sezione, - bullet, **bold**) ---
function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <span key={i} style={{ color: 'var(--tx-bright)', fontWeight: 550 }}>
        {p.slice(2, -2)}
      </span>
    ) : (
      <span key={i}>{p}</span>
    )
  )
}

function EnhancedMarkdown({ md }: { md: string }) {
  const lines = md.split('\n')
  return (
    <div style={{ marginTop: 30 }}>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <SectionLabel key={i} color="var(--tx-9)" style={{ margin: i === 0 ? '0 0 14px' : '28px 0 14px' }}>
              {line.slice(3)}
            </SectionLabel>
          )
        }
        if (line.startsWith('- ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 11 }}>
              <span style={{ color: 'var(--lime)', fontSize: 14, lineHeight: 1.55, flexShrink: 0 }}>·</span>
              <span style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--tx-4)' }}>
                {renderBold(line.slice(2))}
              </span>
            </div>
          )
        }
        return null
      })}
    </div>
  )
}

function EnhanceCTA({ detail, onReload }: { detail: MeetingDetail; onReload: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enhancing = detail.status === 'enhancing' || busy

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await window.scribio.meetings.enhance(detail.id)
      onReload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (enhancing) {
    return (
      <div style={{ marginTop: 30, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--tx-7)', fontSize: 14 }}>
        <span className="sc-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--lime)' }} />
        Generazione note enhanced in corso…
      </div>
    )
  }

  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ fontSize: 14, color: 'var(--tx-9)', marginBottom: 14 }}>
        Note enhanced non ancora generate.
      </div>
      <button
        onClick={() => void run()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 9,
          height: 40,
          padding: '0 18px',
          background: 'var(--lime)',
          border: 'none',
          borderRadius: 10,
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          color: '#0a0a0a'
        }}
      >
        ✦ Genera note enhanced
      </button>
      {error && (
        <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.2)', borderRadius: 10, color: '#e89', fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  )
}

function AskBar({ meetingId }: { meetingId: string }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<string | null>(null)
  const [question, setQuestion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const q = value.trim()
    if (!q || busy) return
    setBusy(true)
    setError(null)
    setQuestion(q)
    setAnswer(null)
    setValue('')
    try {
      const a = await window.scribio.ask.meeting(meetingId, q)
      setAnswer(a)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const showPanel = busy || answer !== null || error !== null

  return (
    <div
      style={{
        flexShrink: 0,
        padding: '16px 40px 20px',
        borderTop: '1px solid var(--hair)',
        background: 'linear-gradient(180deg, rgba(10,10,10,0) 0%, #0A0A0A 40%)'
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {showPanel && (
          <div
            style={{
              marginBottom: 12,
              padding: '14px 16px',
              background: 'var(--bg-2)',
              border: '1px solid var(--hair-07)',
              borderRadius: 12,
              maxHeight: 320,
              overflowY: 'auto'
            }}
          >
            {question && (
              <div className="mono" style={{ fontSize: 11, color: 'var(--tx-9)', marginBottom: 8 }}>
                <span style={{ color: 'var(--lime)' }}>?</span> {question}
              </div>
            )}
            {busy && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--tx-7)', fontSize: 13.5 }}>
                <span className="sc-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--lime)' }} />
                Sto cercando nella riunione…
              </div>
            )}
            {answer && (
              <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--tx-3)', whiteSpace: 'pre-wrap' }}>{answer}</div>
            )}
            {error && <div style={{ fontSize: 13, color: '#e89' }}>{error}</div>}
          </div>
        )}

        <div
          style={{
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
            <path d="M8 1.5 L8 14.5 M2 8 L8 1.5 L14 8" stroke="#5A5A5A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
            placeholder="Chiedi qualcosa su questa riunione…"
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
      </div>
    </div>
  )
}

function ExportMenu({ meetingId }: { meetingId: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const run = async (kind: 'transcript' | 'notes') => {
    setOpen(false)
    setBusy(true)
    try {
      await window.scribio.meetings.export(meetingId, kind)
    } catch {
      /* dialog annullato o errore: silenzioso */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          height: 32,
          padding: '0 12px',
          background: 'var(--bg-4)',
          border: '1px solid var(--hair-10)',
          borderRadius: 8,
          cursor: busy ? 'default' : 'pointer',
          fontSize: 13,
          color: 'var(--tx-3)',
          opacity: busy ? 0.6 : 1
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v8M4.5 7L8 10.5L11.5 7M3 13h10" stroke="#b8b8b8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {busy ? 'Esporto…' : 'Esporta'}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'absolute',
              top: 38,
              left: 0,
              zIndex: 41,
              minWidth: 200,
              background: 'var(--bg-3)',
              border: '1px solid var(--hair-10)',
              borderRadius: 10,
              padding: 5,
              boxShadow: '0 10px 30px rgba(0,0,0,0.45)'
            }}
          >
            {[
              { kind: 'transcript' as const, label: 'Transcript (.txt)' },
              { kind: 'notes' as const, label: 'Note complete (.md)' }
            ].map((it) => (
              <div
                key={it.kind}
                onClick={() => void run(it.kind)}
                style={{ padding: '9px 11px', borderRadius: 7, cursor: 'pointer', fontSize: 13, color: 'var(--tx-3)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {it.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function EnhanceErrorBanner({ detail, onReload }: { detail: MeetingDetail; onReload: () => void }) {
  const [busy, setBusy] = useState(false)
  const retry = async () => {
    setBusy(true)
    try {
      await window.scribio.meetings.enhance(detail.id)
    } catch {
      /* l'errore aggiornato arriva via reload */
    } finally {
      setBusy(false)
      onReload()
    }
  }
  return (
    <div
      style={{
        marginTop: 12,
        padding: '12px 14px',
        background: 'rgba(255,80,80,0.08)',
        border: '1px solid rgba(255,80,80,0.2)',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}
    >
      <div style={{ flex: 1, fontSize: 13, color: '#e89', lineHeight: 1.5 }}>
        Generazione note fallita
        {detail.enhanceError ? <span style={{ color: '#c98' }}>: {detail.enhanceError}</span> : '.'}
      </div>
      <button
        onClick={() => void retry()}
        disabled={busy}
        style={{
          flexShrink: 0,
          height: 32,
          padding: '0 14px',
          background: 'var(--lime)',
          border: 'none',
          borderRadius: 8,
          cursor: busy ? 'default' : 'pointer',
          fontSize: 13,
          fontWeight: 600,
          color: '#0a0a0a',
          opacity: busy ? 0.6 : 1
        }}
      >
        {busy ? 'Riprovo…' : 'Riprova'}
      </button>
    </div>
  )
}

function MeetingMain({ detail, onReload }: { detail: MeetingDetail; onReload: () => void }) {
  const [tab, setTab] = useState<Tab>(detail.enhancedNotes ? 'enhanced' : 'mine')
  const [transcriptOpen, setTranscriptOpen] = useState(!detail.enhancedNotes)
  const [editing, setEditing] = useState(false)
  const [titleVal, setTitleVal] = useState(detail.title)
  useEffect(() => setTitleVal(detail.title), [detail.title])

  const enhanced = detail.enhancedNotes
  const raw = detail.rawNotes

  const saveTitle = async () => {
    const t = titleVal.trim()
    setEditing(false)
    if (!t || t === detail.title) {
      setTitleVal(detail.title)
      return
    }
    await window.scribio.meetings.rename(detail.id, t)
    onReload()
  }

  const titleStyle = {
    margin: '12px 0 0',
    fontSize: 30,
    fontWeight: 600,
    color: 'var(--tx-bright)',
    letterSpacing: '-0.02em',
    lineHeight: 1.15
  } as const

  return (
    <>
      <div className="scroll-y" style={{ flex: 1 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '38px 40px 28px' }}>
          {/* header */}
          <SectionLabel color="var(--lime)">
            {detail.templateName ?? 'Riunione'}
          </SectionLabel>
          {editing ? (
            <input
              autoFocus
              value={titleVal}
              onChange={(e) => setTitleVal(e.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveTitle()
                if (e.key === 'Escape') {
                  setTitleVal(detail.title)
                  setEditing(false)
                }
              }}
              style={{
                ...titleStyle,
                display: 'block',
                width: '100%',
                background: 'var(--bg-2)',
                border: '1px solid var(--hair-09)',
                borderRadius: 8,
                padding: '4px 10px',
                outline: 'none',
                fontFamily: 'inherit'
              }}
            />
          ) : (
            <h1
              onClick={() => setEditing(true)}
              title="Clicca per rinominare"
              style={{ ...titleStyle, cursor: 'text' }}
            >
              {detail.title}
            </h1>
          )}
          <div className="mono" style={{ fontSize: 12, color: 'var(--tx-8)', marginTop: 11 }}>
            {longDate(detail.startedAt)} · {hhmm(detail.startedAt)}
            {detail.endedAt ? `–${hhmm(detail.endedAt)}` : ''} · {durationLabel(detail.startedAt, detail.endedAt)}
          </div>

          <div style={{ marginTop: 16 }}>
            <ExportMenu meetingId={detail.id} />
          </div>

          {(detail.status === 'transcribing' || detail.status === 'enhancing') && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '5px 11px', background: 'var(--lime-06)', border: '1px solid var(--lime-14)', borderRadius: 8 }}>
              <span className="sc-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--lime)' }} />
              <span style={{ fontSize: 12.5, color: 'var(--tx-4)' }}>
                {detail.status === 'transcribing' ? 'Trascrizione finale in corso…' : 'Generazione note in corso…'}
              </span>
            </div>
          )}

          {detail.status === 'error' && <EnhanceErrorBanner detail={detail} onReload={onReload} />}

          {/* participants */}
          {detail.participants.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 18, flexWrap: 'wrap' }}>
              {detail.participants.map((p) => {
                const isMe = /\(tu\)/i.test(p)
                return (
                  <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Avatar initials={initials(p)} isMe={isMe} />
                    <span style={{ fontSize: 13, color: 'var(--tx-5)' }}>
                      {p.replace(/\s*\(tu\)/i, '')}
                      {isMe && <span style={{ color: 'var(--tx-10)' }}> (Tu)</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* toggle */}
          <div style={{ marginTop: 30 }}>
            <SegmentedControl<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'mine', label: 'I miei appunti' },
                { value: 'enhanced', label: 'Enhanced' }
              ]}
            />
          </div>

          {/* content */}
          {tab === 'enhanced' ? (
            enhanced ? (
              <>
                {enhanced.summary && (
                  <div
                    style={{
                      marginTop: 30,
                      padding: '16px 18px',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--hair-07)',
                      borderRadius: 12
                    }}
                  >
                    <SectionLabel color="var(--lime)" style={{ marginBottom: 10 }}>
                      Sommario
                    </SectionLabel>
                    <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--tx-4)' }}>
                      {enhanced.summary}
                    </div>
                  </div>
                )}
                <EnhancedMarkdown md={enhanced.contentMd} />
              </>
            ) : (
              <EnhanceCTA detail={detail} onReload={onReload} />
            )
          ) : (
            <div
              className="mono"
              style={{ marginTop: 30, fontSize: 13.5, lineHeight: 1.85, color: '#b0b0b0', whiteSpace: 'pre-wrap' }}
            >
              {raw?.contentMd ?? '(nessun appunto)'}
            </div>
          )}

          {/* transcript collapse */}
          <div style={{ marginTop: 28 }}>
            <div
              onClick={() => setTranscriptOpen((o) => !o)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '13px 0',
                borderTop: '1px solid var(--hair-07)',
                cursor: 'pointer'
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                style={{ transform: transcriptOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}
              >
                <path d="M4 2.5 L8 6 L4 9.5" stroke="#8A8A8A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <SectionLabel color="var(--tx-8)">Transcript</SectionLabel>
              <span className="mono" style={{ fontSize: 11, color: 'var(--tx-11)' }}>
                {detail.segments.length} segmenti
              </span>
            </div>
            {transcriptOpen && (
              <div style={{ padding: '6px 0 8px', display: 'flex', flexDirection: 'column', gap: 13 }}>
                {detail.segments.map((s) => (
                  <div key={s.id} style={{ display: 'flex', gap: 14 }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--tx-11)', flexShrink: 0, width: 46 }}>
                      {clock(s.tsStart)}
                    </span>
                    <div>
                      <span className="mono" style={{ fontSize: 11, color: s.speaker === 'me' ? 'var(--lime)' : 'var(--tx-8)' }}>
                        {s.speaker === 'me' ? 'Tu' : 'Altri'}
                      </span>
                      <div style={{ fontSize: 13.5, color: 'var(--tx-6)', lineHeight: 1.5, marginTop: 2 }}>
                        {s.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AskBar meetingId={detail.id} />
    </>
  )
}

export default function Meeting() {
  const { id } = useParams<{ id: string }>()
  const [detail, setDetail] = useState<MeetingDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    if (!id) return
    window.scribio.meetings.get(id).then(setDetail)
  }, [id])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    window.scribio.meetings
      .get(id)
      .then(setDetail)
      .finally(() => setLoading(false))
  }, [id])

  // ricarica quando l'enhancement (background o manuale) aggiorna la riunione
  useEffect(() => window.scribio.meetings.onUpdated((uid) => uid === id && reload()), [id, reload])

  const body = useMemo(() => {
    if (loading) return <Centered>Caricamento…</Centered>
    if (!detail) return <Centered>Riunione non trovata.</Centered>
    return <MeetingMain detail={detail} onReload={reload} />
  }, [loading, detail, reload])

  return <SidebarLayout selectedId={id}>{body}</SidebarLayout>
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-9)', fontSize: 14 }}>
      {children}
    </div>
  )
}
