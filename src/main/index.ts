import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { initDb, closeDb } from './db/db'
import { seedDemoIfEmpty } from './db/repositories'
import { registerIpc } from './ipc'
import { getSidecar } from './sidecar'
import { initUpdater } from './updater'

/** Icona finestra: prod = resources/icon.png (extraResources), dev = repo. */
function windowIcon(): string | undefined {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'icon.png')]
    : [join(app.getAppPath(), 'resources', 'icon.png')]
  return candidates.find((p) => existsSync(p))
}

function createWindow(): void {
  const icon = windowIcon()
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    backgroundColor: '#0A0A0A',
    title: 'Scribio',
    ...(icon ? { icon } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // electron-vite inietta ELECTRON_RENDERER_URL in dev.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const database = initDb()
  seedDemoIfEmpty(database)
  registerIpc()
  createWindow()
  initUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  getSidecar().dispose()
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  getSidecar().dispose()
  closeDb()
})
