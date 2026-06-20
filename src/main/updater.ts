import electronUpdater from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import type { UpdateStatus } from '@shared/types'

const { autoUpdater } = electronUpdater

const SIX_HOURS = 6 * 60 * 60 * 1000

function broadcast(status: UpdateStatus): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:status', status)
}

/** Auto-update via GitHub Releases. Attivo solo in app pacchettizzata. */
export function initUpdater(): void {
  if (!app.isPackaged) return // in dev non c'è latest.yml

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-available', (i) => broadcast({ state: 'available', version: i.version }))
  autoUpdater.on('update-not-available', () => broadcast({ state: 'none' }))
  autoUpdater.on('download-progress', (p) =>
    broadcast({ state: 'progress', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (i) => broadcast({ state: 'ready', version: i.version }))
  autoUpdater.on('error', (e) =>
    broadcast({ state: 'error', message: e instanceof Error ? e.message : String(e) })
  )

  void autoUpdater.checkForUpdates()
  setInterval(() => void autoUpdater.checkForUpdates(), SIX_HOURS)
}

/** Riavvia e applica l'aggiornamento già scaricato. */
export function restartToUpdate(): void {
  autoUpdater.quitAndInstall()
}
