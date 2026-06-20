import type { ReactNode } from 'react'
import logoUrl from '../assets/logo.png'

interface Props {
  height?: number
  /** path mostrato dopo "scribio", es. "/impostazioni" */
  path?: string
  /** cluster a destra (timer registrazione, azioni…) */
  right?: ReactNode
}

/** Barra superiore stile prompt da terminale: "~ scribio" + cursore a blocco. */
export default function TerminalTopbar({ height = 46, path, right }: Props) {
  return (
    <div
      style={{
        height,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '0 18px',
        borderBottom: '1px solid var(--hair)',
        background: 'var(--bg-1)'
      }}
    >
      <div
        className="mono"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: '#c8c8c8',
          letterSpacing: '-0.01em'
        }}
      >
        <img
          src={logoUrl}
          alt="Scribio"
          width={20}
          height={20}
          style={{ borderRadius: 5, display: 'block' }}
        />
        scribio
        {path && <span style={{ color: 'var(--tx-11)' }}>{path}</span>}
        <span
          className="sc-blink"
          style={{
            display: 'inline-block',
            width: 7,
            height: 15,
            background: 'var(--lime)',
            marginLeft: 3
          }}
        />
      </div>
      {right && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>{right}</div>}
    </div>
  )
}
