import { useNavigate } from 'react-router-dom'

/** Cluster azioni a destra nella topbar: nuova registrazione + impostazioni. */
export default function NavCluster() {
  const nav = useNavigate()
  return (
    <>
      <button
        onClick={() => nav('/live')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
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
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0a0a0a' }} />
        Registra
      </button>
      <button
        onClick={() => nav('/settings')}
        title="Impostazioni"
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-4)',
          border: '1px solid var(--hair-08)',
          borderRadius: 8,
          cursor: 'pointer'
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="2.4" stroke="#9a9a9a" strokeWidth="1.3" />
          <path
            d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2"
            stroke="#9a9a9a"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </>
  )
}
