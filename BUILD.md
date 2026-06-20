# Scribio — Build & Run

App desktop Windows (Electron + React + sidecar Python). Local-only, single-user.

## Prerequisiti
- Node.js 22+ e npm
- Python 3.11/3.12 (`py` launcher su Windows)
- API key OpenAI (per l'enhancement / Ask — BYOK, inserita nei Settings)

## Setup
```powershell
npm install                       # deps JS + electron-rebuild (better-sqlite3)
cd sidecar
py -3 -m venv .venv
.venv/Scripts/pip install -r requirements.txt
cd ..
```

## Sviluppo
```powershell
npm run dev                       # electron-vite dev (HMR renderer + main)
```
Il main rileva in automatico `sidecar/.venv` e lancia `sidecar/main.py`.
Per sviluppare la UI senza audio reale: `SCRIBIO_SIDECAR_MOCK=1` → usa `sidecar/mock.py`.

> Nota ambiente: se `electron` parte come Node puro, azzerare `ELECTRON_RUN_AS_NODE`.

## Verifiche
```powershell
npm run typecheck                 # TS strict (node + web)
npm run build                     # typecheck + bundle in out/
```

## Motore STT — whisper.cpp Vulkan (cross-vendor)
La trascrizione gira su **whisper.cpp** (backend **Vulkan**): un solo binario che usa la GPU
su **AMD / NVIDIA / Intel** e ricade su CPU dove non c'è device Vulkan. Eseguito come
`whisper-server` persistente; il sidecar Python (cattura audio) lo interroga via HTTP `/inference`.

Build del binario (una tantum, su una macchina con toolchain):
```powershell
# prerequisiti: Vulkan SDK, CMake, VS 2022 Build Tools (workload C++)
git clone --depth 1 https://github.com/ggml-org/whisper.cpp C:\path\whisper.cpp
pwsh -File scripts/build-whisper.ps1 -Src C:\path\whisper.cpp
# → copia whisper-server.exe + *.dll in sidecar/whisper-bin/
```
Modello GGUF (`ggml-large-v3-turbo-q5_0.bin`) **non** bundlato: scaricato al primo uso in
`%APPDATA%/scribio/models` (env `SCRIBIO_MODEL_DIR`).

## Packaging (M6)
1. **Sidecar** → eseguibile PyInstaller (onedir):
   ```powershell
   .venv/Scripts/pip install pyinstaller      # una volta
   npm run build:sidecar                       # → sidecar/dist/scribio-sidecar/
   ```
2. **whisper-bin** deve esistere (vedi sopra): viene bundlato in `resources/whisper`.
3. **Installer** Windows (electron-builder, NSIS):
   ```powershell
   npm run dist                                # build + build:sidecar + installer in dist/
   ```
   - `npm run package` → solo cartella `dist/win-unpacked` (senza installer), utile per test.
   - Il sidecar viene copiato in `resources/sidecar`; il main lo invoca via path assoluto in produzione (`app.isPackaged`).
   - `better-sqlite3` (.node) è estratto da asar (`asarUnpack`).

## Modelli STT
Il modello GGUF (`ggml-large-v3-turbo-q5_0.bin`, ~570MB) **non** è incluso nell'installer:
viene scaricato al primo uso in `%APPDATA%/scribio/models` (env `SCRIBIO_MODEL_DIR`).
Modello bloccato (nessuna scelta in UI).

## Dati
Tutto in `%APPDATA%/scribio/`: `scribio.db` (SQLite), `settings.json`, `models/`,
`openai.key.enc` (API key cifrata via OS safeStorage). L'audio non viene mai persistito.

## Release / auto-update (GitHub Releases)
L'app si auto-aggiorna con `electron-updater` leggendo le Release pubbliche del repo
`andreaiaccino/scribio` (provider in `electron-builder.yml`). In dev l'updater è disattivato.

Per pubblicare una nuova versione:
1. **Bump** `version` in `package.json` (es. 0.1.0 → 0.1.1). Senza bump, nessun update.
2. `GH_TOKEN` (PAT scope `repo`) in `.env` — usato solo qui, non finisce nell'app.
3. Build + sidecar devono poter girare (serve `sidecar/.venv` + `sidecar/whisper-bin`):
   ```powershell
   $env:GH_TOKEN = (Get-Content .env | Select-String '^GH_TOKEN=').ToString().Split('=',2)[1]
   npm run release      # build + build:sidecar + electron-builder --win --publish always
   ```
   Carica `Scribio-Setup-<ver>.exe` + `latest.yml` + `.blockmap` nella Release.
4. I client (≥ versione precedente) al riavvio scaricano in background e mostrano il banner
   "Aggiornamento pronto — Riavvia". Il `.blockmap` rende i download differenziali.

> App non firmata: al primo install c'è il warning SmartScreen; l'auto-update funziona comunque
> (electron-updater verifica via sha512). Per distribuzione larga valutare un certificato OV/EV.

> Fallback upload: se `--publish` non carica tutti gli asset (l'exe grande a volte non completa),
> caricarli a mano e pubblicare la release:
> ```powershell
> gh release upload v<ver> dist\Scribio-Setup-<ver>.exe dist\latest.yml --clobber
> gh release edit v<ver> --draft=false
> ```
> Per l'auto-update servono i 3 asset: `latest.yml`, `Scribio-Setup-<ver>.exe`, `.exe.blockmap`,
> e la release NON deve essere draft.
