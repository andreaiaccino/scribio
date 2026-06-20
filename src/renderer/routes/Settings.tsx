import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AuthUser, DeviceList, NoteStyle, RemoteToken, Settings as SettingsT } from '@shared/types'
import TerminalTopbar from '../components/TerminalTopbar'
import { SectionLabel, SegmentedControl, Select, Switch } from '../components/primitives'

const NAV = [
  { key: 'generali', label: 'Generali', icon: 'gear' },
  { key: 'ai', label: 'Trascrizione & AI', icon: 'lines' },
  { key: 'audio', label: 'Audio & cattura', icon: 'wave' },
  { key: 'privacy', label: 'Privacy & self-hosting', icon: 'shield' },
  { key: 'shortcuts', label: 'Scorciatoie', icon: 'kbd' },
  { key: 'account', label: 'Account', icon: 'user' }
] as const

function NavIcon({ kind, active }: { kind: string; active: boolean }) {
  const c = active ? 'var(--lime)' : '#7a7a7a'
  switch (kind) {
    case 'lines':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M3 4h10M3 8h10M3 12h6" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'wave':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M8 3v10M5 5.5v5M11 5.5v5M2.5 7v2M13.5 7v2" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'shield':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <rect x="3" y="3" width="10" height="10" rx="2.5" stroke={c} strokeWidth="1.3" />
          <path d="M6 8.5l1.5 1.5L10.5 6.5" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'kbd':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <rect x="2.5" y="4.5" width="11" height="7" rx="1.5" stroke={c} strokeWidth="1.3" />
          <path d="M5 7h0M8 7h0M11 7h0M5 9.5h6" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'user':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="5.5" r="2.5" stroke={c} strokeWidth="1.3" />
          <path d="M3 13c0-2.5 2.2-4 5-4s5 1.5 5 4" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="2.4" stroke={c} strokeWidth="1.3" />
          <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
  }
}

function Row({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 0', borderTop: '1px solid var(--hair)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, color: 'var(--tx-2)', fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--tx-10)', marginTop: 3 }}>{desc}</div>
      </div>
      {children}
    </div>
  )
}

function Pill({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <div
      className={mono ? 'mono' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        height: 36,
        padding: '0 13px',
        background: 'var(--bg-4)',
        border: '1px solid var(--hair-10)',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: mono ? 12.5 : 13,
        color: 'var(--tx-3)'
      }}
    >
      {children}
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="#7A7A7A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

const inputStyle = {
  height: 38,
  padding: '0 13px',
  width: '100%',
  background: 'var(--bg-4)',
  border: '1px solid var(--hair-10)',
  borderRadius: 8,
  fontSize: 13.5,
  color: 'var(--tx-2)',
  outline: 'none'
} as const

function RemoteAccess() {
  const [tokens, setTokens] = useState<RemoteToken[]>([])
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = () => {
    window.scribio.remote.listTokens().then(setTokens).catch(() => {})
  }
  useEffect(() => {
    reload()
    window.scribio.remote.url().then(setUrl)
  }, [])

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await window.scribio.remote.createToken(name)
      setFresh(r.token)
      setName('')
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 40 }}>
      <SectionLabel style={{ marginBottom: 6 }}>Accesso remoto · MCP</SectionLabel>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--tx-10)', lineHeight: 1.5 }}>
        Collega Hermes o un client MCP alle tue riunioni. Endpoint da incollare nel client:
      </p>
      <div className="mono" style={{ fontSize: 12, color: 'var(--tx-4)', padding: '10px 12px', background: 'var(--bg-4)', border: '1px solid var(--hair-08)', borderRadius: 8, wordBreak: 'break-all' }}>
        {url || '…'}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="nome token (es. Hermes)"
          style={{ ...inputStyle, height: 36, flex: 1 }}
        />
        <button
          onClick={() => void create()}
          disabled={busy}
          style={{ height: 36, padding: '0 14px', background: 'var(--lime)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#0a0a0a', opacity: busy ? 0.6 : 1 }}
        >
          Genera token
        </button>
      </div>

      {fresh && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--lime-04)', border: '1px solid var(--lime-14)', borderRadius: 10 }}>
          <div style={{ fontSize: 12.5, color: '#d8e8a0', marginBottom: 6 }}>
            Copia ora questo token — non sarà più mostrato:
          </div>
          <div
            className="mono"
            onClick={() => void navigator.clipboard.writeText(fresh)}
            title="Clicca per copiare"
            style={{ fontSize: 12, color: 'var(--tx-2)', wordBreak: 'break-all', cursor: 'pointer' }}
          >
            {fresh}
          </div>
        </div>
      )}
      {error && <div style={{ marginTop: 10, fontSize: 13, color: '#e89' }}>{error}</div>}

      {tokens.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {tokens.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--hair)' }}>
              <span style={{ fontSize: 13, color: 'var(--tx-4)' }}>{t.name ?? 'token'}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--tx-11)' }}>
                {t.lastUsedAt ? 'usato' : 'mai usato'}
              </span>
              <button
                onClick={() => void window.scribio.remote.revoke(t.id).then(reload)}
                style={{ marginLeft: 'auto', height: 30, padding: '0 12px', background: 'transparent', border: '1px solid var(--hair-10)', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: '#c46' }}
              >
                Revoca
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AccountPanel() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    window.scribio.auth
      .current()
      .then(setUser)
      .finally(() => setLoading(false))
  }, [])

  const submit = async () => {
    if (!email.trim() || !password || busy) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'signin') {
        setUser(await window.scribio.auth.signIn(email.trim(), password))
      } else {
        const u = await window.scribio.auth.signUp(email.trim(), password)
        setUser(u)
        if (!u) setInfo('Controlla l’email per confermare la registrazione, poi accedi.')
      }
      setPassword('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    setBusy(true)
    try {
      await window.scribio.auth.signOut()
      setUser(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, padding: '36px 44px 48px' }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--tx-bright)', letterSpacing: '-0.01em' }}>
        Account
      </h2>
      <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--tx-9)', lineHeight: 1.5 }}>
        Accedi per sincronizzare le riunioni nel cloud (solo testo, mai l’audio) e abilitare ricerca
        semantica e accesso remoto. La sessione è cifrata nello storage sicuro dell’OS.
      </p>

      {loading ? (
        <div style={{ marginTop: 28, fontSize: 13.5, color: 'var(--tx-9)' }}>Caricamento…</div>
      ) : user ? (
        <div style={{ marginTop: 28 }}>
          <SectionLabel style={{ marginBottom: 12 }}>Connesso</SectionLabel>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              background: 'var(--bg-2)',
              border: '1px solid var(--hair-07)',
              borderRadius: 12
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--lime)' }} />
            <span style={{ fontSize: 14, color: 'var(--tx-2)' }}>{user.email}</span>
            <button
              onClick={() => void logout()}
              disabled={busy}
              style={{
                marginLeft: 'auto',
                height: 34,
                padding: '0 14px',
                background: 'var(--bg-4)',
                border: '1px solid var(--hair-10)',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--tx-3)'
              }}
            >
              Esci
            </button>
          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => {
                setBusy(true)
                setInfo(null)
                setError(null)
                window.scribio.sync
                  .all()
                  .then((r) => {
                    if (r.error) setError(`${r.error}${r.failed ? ` (${r.failed} fallite)` : ''}`)
                    else setInfo(`Sincronizzate ${r.ok} riunioni.`)
                  })
                  .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                  .finally(() => setBusy(false))
              }}
              disabled={busy}
              style={{
                height: 36,
                padding: '0 16px',
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
              {busy ? 'Sincronizzazione…' : 'Sincronizza ora'}
            </button>
            <span style={{ fontSize: 12.5, color: 'var(--tx-10)' }}>
              Le nuove riunioni si sincronizzano in automatico.
            </span>
          </div>
          {error && <div style={{ marginTop: 12, fontSize: 13, color: '#e89' }}>{error}</div>}
          {info && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--tx-7)' }}>{info}</div>}

          <RemoteAccess />
        </div>
      ) : (
        <div style={{ marginTop: 28, maxWidth: 380 }}>
          <SectionLabel style={{ marginBottom: 12 }}>
            {mode === 'signin' ? 'Accedi' : 'Crea account'}
          </SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@esempio.com"
              style={inputStyle}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
              placeholder="password"
              style={inputStyle}
            />
            <button
              onClick={() => void submit()}
              disabled={busy}
              style={{
                height: 40,
                border: 'none',
                borderRadius: 10,
                background: 'var(--lime)',
                color: '#0a0a0a',
                fontSize: 14,
                fontWeight: 600,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.6 : 1
              }}
            >
              {busy ? '…' : mode === 'signin' ? 'Accedi' : 'Registrati'}
            </button>
          </div>
          {error && <div style={{ marginTop: 12, fontSize: 13, color: '#e89' }}>{error}</div>}
          {info && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--tx-7)' }}>{info}</div>}
          <button
            onClick={() => {
              setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
              setError(null)
              setInfo(null)
            }}
            style={{ marginTop: 14, background: 'transparent', border: 'none', color: 'var(--tx-9)', fontSize: 12.5, cursor: 'pointer', padding: 0 }}
          >
            {mode === 'signin' ? 'Non hai un account? Registrati' : 'Hai già un account? Accedi'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function Settings() {
  const nav = useNavigate()
  const [active, setActive] = useState('ai')
  const [settings, setSettings] = useState<SettingsT | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [devices, setDevices] = useState<DeviceList | null>(null)
  const [devError, setDevError] = useState<string | null>(null)
  const [devLoading, setDevLoading] = useState(false)

  useEffect(() => {
    void window.scribio.settings.get().then(setSettings)
  }, [])

  const loadDevices = () => {
    setDevLoading(true)
    setDevError(null)
    window.scribio.devices
      .list()
      .then(setDevices)
      .catch((e) => setDevError(e instanceof Error ? e.message : String(e)))
      .finally(() => setDevLoading(false))
  }

  useEffect(() => loadDevices(), [])

  const patch = (p: Partial<SettingsT>) => {
    setSettings((s) => (s ? { ...s, ...p } : s))
    void window.scribio.settings.set(p)
  }

  const saveKey = async () => {
    if (!keyInput.trim()) return
    await window.scribio.settings.setOpenAIKey(keyInput.trim())
    setKeyInput('')
    setKeySaved(true)
    setSettings((s) => (s ? { ...s, hasOpenAIKey: true } : s))
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' }}>
      <TerminalTopbar
        height={52}
        path="/impostazioni"
        right={
          <button
            onClick={() => nav('/')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 32,
              padding: '0 14px',
              background: 'var(--bg-4)',
              border: '1px solid var(--hair-08)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--tx-3)'
            }}
          >
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
              <path d="M7.5 2.5L4 6l3.5 3.5" stroke="#b8b8b8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Indietro
          </button>
        }
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* settings nav */}
        <div
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: '1px solid var(--hair)',
            background: 'var(--bg-1)',
            padding: '18px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2
          }}
        >
          <div
            className="mono"
            style={{ fontSize: 10, color: 'var(--tx-11)', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '6px 12px 10px' }}
          >
            Impostazioni
          </div>
          {NAV.map((n) => {
            const isActive = n.key === active
            return (
              <div
                key={n.key}
                onClick={() => setActive(n.key)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: isActive ? '9px 12px 9px 13px' : '9px 12px',
                  borderRadius: 8,
                  background: isActive ? 'var(--lime-06)' : 'transparent',
                  cursor: 'pointer'
                }}
              >
                {isActive && (
                  <div style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 2, borderRadius: 2, background: 'var(--lime)' }} />
                )}
                <NavIcon kind={n.icon} active={isActive} />
                <span style={{ fontSize: 13, color: isActive ? 'var(--tx-1)' : 'var(--tx-7)', fontWeight: isActive ? 550 : 400 }}>
                  {n.label}
                </span>
              </div>
            )
          })}
          <div className="mono" style={{ marginTop: 'auto', padding: '10px 12px', fontSize: 10, color: 'var(--tx-12)', cursor: 'pointer' }} onClick={() => nav('/')}>
            scribio · v0.1.0
          </div>
        </div>

        {/* panel */}
        <div className="scroll-y" style={{ flex: 1, minWidth: 0, background: 'var(--bg-0)' }}>
          {active === 'account' ? (
            <AccountPanel />
          ) : (
          <div style={{ maxWidth: 720, padding: '36px 44px 48px' }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--tx-bright)', letterSpacing: '-0.01em' }}>
              Trascrizione &amp; AI
            </h2>
            <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--tx-9)', lineHeight: 1.5 }}>
              La trascrizione avviene in locale sul tuo dispositivo: nessun audio lascia la macchina.
            </p>

            {/* Trascrizione */}
            <SectionLabel style={{ margin: '32px 0 6px' }}>Trascrizione</SectionLabel>

            <Row title="Lingua di trascrizione" desc="Lingua principale rilevata durante le call.">
              <Select
                value={settings?.language ?? 'it'}
                onChange={(v) => patch({ language: v })}
                minWidth={130}
                options={[
                  { value: 'it', label: 'Italiano' },
                  { value: 'en', label: 'English' }
                ]}
              />
            </Row>
            <Row title="Riconoscimento speaker" desc='Distingue "Tu" dagli altri partecipanti (per stream audio).'>
              <Switch checked={settings?.speakerLabels ?? true} onChange={(v) => patch({ speakerLabels: v })} />
            </Row>
            <Row title="Fondi appunti e transcript" desc="Genera le note enhanced unendo i tuoi appunti al transcript.">
              <Switch checked={settings?.mergeNotes ?? true} onChange={(v) => patch({ mergeNotes: v })} />
            </Row>

            {/* Dispositivi audio */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '32px 0 6px' }}>
              <SectionLabel>Dispositivi audio</SectionLabel>
              <button
                onClick={loadDevices}
                title="Aggiorna elenco dispositivi"
                style={{ background: 'transparent', border: 'none', color: 'var(--tx-9)', cursor: 'pointer', fontSize: 11, padding: 0 }}
              >
                {devLoading ? 'rilevamento…' : '↻ aggiorna'}
              </button>
            </div>

            <Row title="Microfono (Tu)" desc="La tua voce. Lascia automatico per usare il microfono di default.">
              <Select
                minWidth={230}
                value={settings?.micIndex != null ? String(settings.micIndex) : ''}
                onChange={(v) => patch({ micIndex: v === '' ? null : Number(v) })}
                options={[
                  { value: '', label: 'Automatico (default)' },
                  ...(devices?.mic ?? []).map((d) => ({ value: String(d.index), label: d.name }))
                ]}
              />
            </Row>
            <Row
              title="Sorgente “Altri” (loopback)"
              desc="L’uscita audio da cui senti gli altri partecipanti. Con VoiceMeeter scegli l’uscita giusta (es. il loopback delle cuffie/altoparlanti dove suona la call)."
            >
              <Select
                minWidth={230}
                value={settings?.loopbackIndex != null ? String(settings.loopbackIndex) : ''}
                onChange={(v) => patch({ loopbackIndex: v === '' ? null : Number(v) })}
                options={[
                  { value: '', label: 'Automatico (default)' },
                  ...(devices?.loopback ?? []).map((d) => ({ value: String(d.index), label: d.name }))
                ]}
              />
            </Row>
            {devError && (
              <div style={{ fontSize: 12.5, color: '#e89', padding: '4px 0' }}>
                Impossibile leggere i dispositivi: {devError}
              </div>
            )}

            {/* Modello AI — OpenAI BYOK */}
            <SectionLabel style={{ margin: '32px 0 6px' }}>Modello AI · note enhanced</SectionLabel>

            <Row title="Provider" desc="Motore che rifinisce e struttura le note.">
              <Pill>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lime)' }} />
                OpenAI
              </Pill>
            </Row>

            <Row title="API key OpenAI" desc="Salvata nello storage sicuro dell'OS (mai in chiaro).">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value)
                    setKeySaved(false)
                  }}
                  placeholder={settings?.hasOpenAIKey ? '•••••••• (impostata)' : 'sk-…'}
                  className="mono"
                  style={{
                    height: 36,
                    padding: '0 13px',
                    minWidth: 220,
                    background: 'var(--bg-4)',
                    border: '1px solid var(--hair-10)',
                    borderRadius: 8,
                    fontSize: 12.5,
                    color: 'var(--tx-3)',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={() => void saveKey()}
                  style={{
                    height: 36,
                    padding: '0 14px',
                    border: 'none',
                    borderRadius: 8,
                    background: keySaved ? 'var(--bg-5)' : 'var(--lime)',
                    color: keySaved ? 'var(--tx-2)' : '#0a0a0a',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {keySaved ? 'Salvata ✓' : 'Salva'}
                </button>
              </div>
            </Row>

            <Row title="Modello" desc="Modello OpenAI usato per generare le note (Structured Outputs).">
              <Select
                mono
                value={settings?.openAIModel ?? 'gpt-5-mini'}
                onChange={(v) => patch({ openAIModel: v })}
                minWidth={150}
                options={[
                  { value: 'gpt-5-mini', label: 'gpt-5-mini' },
                  { value: 'gpt-5', label: 'gpt-5' },
                  { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
                  { value: 'gpt-4.1', label: 'gpt-4.1' }
                ]}
              />
            </Row>

            <div style={{ borderBottom: '1px solid var(--hair)' }}>
              <Row title="Stile delle note" desc="Tono e densità delle note enhanced generate.">
                <SegmentedControl<NoteStyle>
                  value={settings?.noteStyle ?? 'balanced'}
                  onChange={(v) => patch({ noteStyle: v })}
                  options={[
                    { value: 'concise', label: 'Conciso' },
                    { value: 'balanced', label: 'Bilanciato' },
                    { value: 'detailed', label: 'Dettagliato' }
                  ]}
                />
              </Row>
            </div>

            {/* callout self-hosting (vero per lo STT locale) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                marginTop: 28,
                padding: '16px 18px',
                background: 'var(--lime-04)',
                border: '1px solid var(--lime-14)',
                borderRadius: 12
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
                <rect x="2.5" y="3" width="11" height="10" rx="2" stroke="#CAFE0E" strokeWidth="1.3" />
                <path d="M6 6.5l1.5 1.5L10.5 4.5" stroke="#CAFE0E" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <div style={{ fontSize: 13.5, color: '#d8e8a0', fontWeight: 550 }}>Audio e transcript restano in locale</div>
                <div style={{ fontSize: 12.5, color: '#8a9a6a', marginTop: 3, lineHeight: 1.5 }}>
                  L'audio non lascia mai il dispositivo. Solo il testo del transcript viene inviato a OpenAI per l'enhancement (BYOK). Dati salvati localmente.
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  )
}
