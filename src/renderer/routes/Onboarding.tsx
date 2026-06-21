import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AudioLevel, DeviceList } from '@shared/types'
import { SectionLabel, Select } from '../components/primitives'

const STEPS = ['Benvenuto', 'Microfono', 'Audio altri', 'OpenAI', 'Pronto'] as const

/** Barra VU: rms grezzo → larghezza 0..1 (gain ×4) con soglia "ok" verde lime. */
function VuMeter({ level, label }: { level: number; label: string }) {
  const pct = Math.min(1, level * 4)
  const ok = pct > 0.06
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span className="mono" style={{ fontSize: 11, color: ok ? 'var(--lime)' : 'var(--tx-9)' }}>
          {label}
        </span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--tx-11)' }}>
          {ok ? 'segnale rilevato' : 'in ascolto…'}
        </span>
      </div>
      <div
        style={{
          height: 12,
          borderRadius: 7,
          background: 'var(--bg-4)',
          border: '1px solid var(--hair-10)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.round(pct * 100)}%`,
            background: 'var(--lime)',
            borderRadius: 6,
            transition: 'width .08s linear'
          }}
        />
      </div>
    </div>
  )
}

export default function Onboarding() {
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [devices, setDevices] = useState<DeviceList | null>(null)
  const [devError, setDevError] = useState<string | null>(null)
  const [micIndex, setMicIndex] = useState<number | null>(null)
  const [loopbackIndex, setLoopbackIndex] = useState<number | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [displayed, setDisplayed] = useState({ me: 0, others: 0 })
  const rawRef = useRef({ me: 0, others: 0 })

  // settings correnti (device già scelti in precedenza) + lista device
  useEffect(() => {
    void window.scribio.settings.get().then((s) => {
      setMicIndex(s.micIndex)
      setLoopbackIndex(s.loopbackIndex)
    })
    window.scribio.devices
      .list()
      .then(setDevices)
      .catch((e) => setDevError(e instanceof Error ? e.message : String(e)))
  }, [])

  // sottoscrizione livelli (una volta): scrive il raw nell'ref
  useEffect(() => {
    const off = window.scribio.audio.onLevel((l: AudioLevel) => {
      rawRef.current[l.speaker] = l.rms
    })
    return off
  }, [])

  // probe attivo solo sugli step device; si riavvia se cambia un device
  const probing = step === 1 || step === 2
  useEffect(() => {
    if (!probing) return
    void window.scribio.audio.probeStart({ micIndex, loopbackIndex })
    return () => {
      void window.scribio.audio.probeStop()
    }
  }, [probing, micIndex, loopbackIndex])

  // animazione VU: attack veloce, decay morbido (la barra scende se l'audio cessa)
  useEffect(() => {
    if (!probing) {
      setDisplayed({ me: 0, others: 0 })
      return
    }
    const id = setInterval(() => {
      setDisplayed((prev) => {
        const next = { me: 0, others: 0 }
        for (const k of ['me', 'others'] as const) {
          const raw = rawRef.current[k]
          next[k] = raw > prev[k] ? raw : prev[k] * 0.8
          rawRef.current[k] = raw * 0.6 // decade se non arrivano nuovi eventi
        }
        return next
      })
    }, 70)
    return () => clearInterval(id)
  }, [probing])

  const saveKey = async () => {
    if (!keyInput.trim()) return
    await window.scribio.settings.setOpenAIKey(keyInput.trim())
    setKeyInput('')
    setKeySaved(true)
  }

  const finish = async () => {
    await window.scribio.settings.set({ onboarded: true, micIndex, loopbackIndex })
    nav('/', { replace: true })
  }

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  return (
    <div
      style={{
        height: '100%',
        background: 'var(--bg-0)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40
      }}
    >
      <div style={{ width: '100%', maxWidth: 520 }}>
        {/* progress dots */}
        <div style={{ display: 'flex', gap: 7, marginBottom: 28 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: i <= step ? 'var(--lime)' : 'var(--bg-5)',
                transition: 'background .2s'
              }}
            />
          ))}
        </div>

        <SectionLabel color="var(--lime)">
          Configurazione · {step + 1}/{STEPS.length}
        </SectionLabel>

        {/* --- contenuto step --- */}
        {step === 0 && (
          <div style={{ marginTop: 14 }}>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 600, color: 'var(--tx-bright)', letterSpacing: '-0.02em' }}>
              Benvenuto in Scribio.
            </h1>
            <p style={{ margin: '14px 0 0', fontSize: 14.5, color: 'var(--tx-9)', lineHeight: 1.6 }}>
              In un minuto configuriamo l'audio così le tue call vengono catturate correttamente.
              La trascrizione avviene <strong style={{ color: 'var(--tx-4)' }}>in locale</strong>: l'audio
              non lascia mai questo dispositivo.
            </p>
          </div>
        )}

        {step === 1 && (
          <div style={{ marginTop: 14 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: 'var(--tx-bright)', letterSpacing: '-0.02em' }}>
              Il tuo microfono
            </h1>
            <p style={{ margin: '12px 0 18px', fontSize: 14, color: 'var(--tx-9)', lineHeight: 1.6 }}>
              È la sorgente "<span style={{ color: 'var(--lime)' }}>Tu</span>". Parla: la barra deve muoversi.
            </p>
            <Select
              minWidth={300}
              value={micIndex != null ? String(micIndex) : ''}
              onChange={(v) => setMicIndex(v === '' ? null : Number(v))}
              options={[
                { value: '', label: 'Automatico (default)' },
                ...(devices?.mic ?? []).map((d) => ({ value: String(d.index), label: d.name }))
              ]}
            />
            <VuMeter level={displayed.me} label="Tu" />
            {devError && <div style={{ marginTop: 10, fontSize: 12.5, color: '#e89' }}>{devError}</div>}
          </div>
        )}

        {step === 2 && (
          <div style={{ marginTop: 14 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: 'var(--tx-bright)', letterSpacing: '-0.02em' }}>
              L'audio degli altri
            </h1>
            <p style={{ margin: '12px 0 18px', fontSize: 14, color: 'var(--tx-9)', lineHeight: 1.6 }}>
              È il <strong style={{ color: 'var(--tx-4)' }}>loopback</strong> da cui senti gli altri
              partecipanti. Fai partire un suono o una call di prova: la barra deve muoversi. Con
              VoiceMeeter scegli l'uscita dove suona la call.
            </p>
            <Select
              minWidth={300}
              value={loopbackIndex != null ? String(loopbackIndex) : ''}
              onChange={(v) => setLoopbackIndex(v === '' ? null : Number(v))}
              options={[
                { value: '', label: 'Automatico (default)' },
                ...(devices?.loopback ?? []).map((d) => ({ value: String(d.index), label: d.name }))
              ]}
            />
            <VuMeter level={displayed.others} label="Altri" />
          </div>
        )}

        {step === 3 && (
          <div style={{ marginTop: 14 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: 'var(--tx-bright)', letterSpacing: '-0.02em' }}>
              Chiave OpenAI <span style={{ fontSize: 15, color: 'var(--tx-10)' }}>(opzionale)</span>
            </h1>
            <p style={{ margin: '12px 0 18px', fontSize: 14, color: 'var(--tx-9)', lineHeight: 1.6 }}>
              Serve solo per le note enhanced (BYOK). La trascrizione funziona anche senza. Puoi
              aggiungerla ora o più tardi dalle Impostazioni. Salvata nello storage sicuro dell'OS.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => {
                  setKeyInput(e.target.value)
                  setKeySaved(false)
                }}
                placeholder="sk-…"
                className="mono"
                style={{
                  flex: 1,
                  height: 38,
                  padding: '0 13px',
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
                  height: 38,
                  padding: '0 16px',
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
          </div>
        )}

        {step === 4 && (
          <div style={{ marginTop: 14 }}>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 600, color: 'var(--tx-bright)', letterSpacing: '-0.02em' }}>
              Tutto pronto.
            </h1>
            <p style={{ margin: '14px 0 0', fontSize: 14.5, color: 'var(--tx-9)', lineHeight: 1.6 }}>
              Sei a posto. Avvia una registrazione dalla home: Scribio cattura, trascrive in locale e
              fonde i tuoi appunti col transcript. Puoi rivedere queste scelte dalle Impostazioni.
            </p>
          </div>
        )}

        {/* --- nav --- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 36 }}>
          {step > 0 ? (
            <button
              onClick={back}
              style={{ height: 40, padding: '0 16px', background: 'var(--bg-4)', border: '1px solid var(--hair-10)', borderRadius: 10, cursor: 'pointer', fontSize: 13.5, color: 'var(--tx-3)' }}
            >
              Indietro
            </button>
          ) : (
            <button
              onClick={() => void finish()}
              style={{ height: 40, padding: '0 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--tx-10)' }}
            >
              Salta
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step === 3 && (
            <button
              onClick={next}
              style={{ height: 40, padding: '0 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--tx-10)' }}
            >
              Salta
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              onClick={next}
              style={{ height: 40, padding: '0 22px', background: 'var(--lime)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#0a0a0a' }}
            >
              Continua
            </button>
          ) : (
            <button
              onClick={() => void finish()}
              style={{ height: 40, padding: '0 22px', background: 'var(--lime)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#0a0a0a' }}
            >
              Inizia a usare Scribio
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
