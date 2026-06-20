import { useState, type CSSProperties, type ReactNode } from 'react'

/** Etichetta di sezione mono uppercase (mockup). */
export function SectionLabel({
  children,
  color = 'var(--tx-9)',
  style
}: {
  children: ReactNode
  color?: string
  style?: CSSProperties
}) {
  return (
    <div
      className="mono"
      style={{
        fontSize: 11,
        color,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        ...style
      }}
    >
      {children}
    </div>
  )
}

/** Etichetta gruppo sidebar (più piccola, tracking ampio). */
export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="mono"
      style={{
        fontSize: 10,
        color: 'var(--tx-11)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        padding: '10px 8px 8px'
      }}
    >
      {children}
    </div>
  )
}

/** Toggle lime on/off (mockup Settings). */
export function Switch({
  checked,
  onChange
}: {
  checked: boolean
  onChange?: (v: boolean) => void
}) {
  return (
    <div
      onClick={() => onChange?.(!checked)}
      style={{
        width: 40,
        height: 23,
        borderRadius: 12,
        background: checked ? 'var(--lime)' : '#2a2a2a',
        padding: 2,
        display: 'flex',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        cursor: 'pointer',
        transition: 'background .15s'
      }}
    >
      <span
        style={{
          width: 19,
          height: 19,
          borderRadius: '50%',
          background: checked ? '#0a0a0a' : '#9a9a9a'
        }}
      />
    </div>
  )
}

/** Controllo segmentato (toggle appunti/enhanced, stile note). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange
}: {
  options: { value: T; label: string }[]
  value: T
  onChange?: (v: T) => void
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 3,
        padding: 3,
        background: 'var(--bg-4)',
        border: '1px solid var(--hair)',
        borderRadius: 10
      }}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange?.(o.value)}
            style={{
              padding: '7px 16px',
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              fontFamily: 'inherit',
              transition: 'all .15s',
              background: active ? '#0a0a0a' : 'transparent',
              color: active ? 'var(--tx-1)' : 'var(--tx-9)',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.5)' : 'none'
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Dropdown stile "pill" del mockup (trigger + menu dark). */
export function Select({
  value,
  options,
  onChange,
  mono = false,
  minWidth
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  mono?: boolean
  minWidth?: number
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)?.label ?? value

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        className={mono ? 'mono' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          height: 36,
          padding: '0 13px',
          minWidth,
          background: 'var(--bg-4)',
          border: `1px solid ${open ? 'var(--lime-40)' : 'var(--hair-10)'}`,
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: mono ? 12.5 : 13,
          color: 'var(--tx-3)'
        }}
      >
        <span style={{ marginRight: 'auto' }}>{current}</span>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="#7A7A7A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            className={mono ? 'mono' : undefined}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              minWidth: '100%',
              zIndex: 41,
              background: 'var(--bg-2)',
              border: '1px solid var(--hair-10)',
              borderRadius: 8,
              padding: 4,
              boxShadow: '0 12px 32px -8px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 1
            }}
          >
            {options.map((o) => {
              const active = o.value === value
              return (
                <div
                  key={o.value}
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontSize: mono ? 12.5 : 13,
                    color: active ? 'var(--tx-1)' : 'var(--tx-6)',
                    background: active ? 'var(--lime-06)' : 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span style={{ marginRight: 'auto' }}>{o.label}</span>
                  {active && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6.4 L4.7 9 L10 3" stroke="#CAFE0E" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/** Avatar con iniziali (partecipanti). isMe → bordo lime. */
export function Avatar({ initials, isMe = false }: { initials: string; isMe?: boolean }) {
  return (
    <span
      className="mono"
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: '#1e1e1e',
        border: `1px solid ${isMe ? 'var(--lime-40)' : 'var(--hair-10)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        color: isMe ? 'var(--lime)' : '#b0b0b0',
        flexShrink: 0
      }}
    >
      {initials}
    </span>
  )
}
