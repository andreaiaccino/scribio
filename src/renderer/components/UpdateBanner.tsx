import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'

/** Banner discreto in basso: appare quando un aggiornamento è pronto (download
 *  completato in background). L'utente sceglie quando riavviare. */
export default function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => window.scribio.updates.onStatus(setStatus), [])

  if (!status || (status.state !== 'ready' && status.state !== 'progress')) return null

  const downloading = status.state === 'progress'

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '11px 16px',
        background: 'var(--bg-2)',
        border: '1px solid var(--hair-10)',
        borderRadius: 12,
        boxShadow: '0 8px 30px rgba(0,0,0,0.4)'
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--lime)' }} className={downloading ? 'sc-pulse' : undefined} />
      {downloading ? (
        <span style={{ fontSize: 13, color: 'var(--tx-5)' }}>
          Download aggiornamento… {status.percent}%
        </span>
      ) : (
        <>
          <span style={{ fontSize: 13, color: 'var(--tx-3)' }}>
            Aggiornamento {status.version} pronto.
          </span>
          <button
            onClick={() => void window.scribio.updates.restart()}
            style={{
              height: 32,
              padding: '0 14px',
              background: 'var(--lime)',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: '#0a0a0a'
            }}
          >
            Riavvia ora
          </button>
        </>
      )}
    </div>
  )
}
