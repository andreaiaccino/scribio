# Build Spec — Scribio MVP (per Claude Code)

> **Documento complementare al PRD** (`PRD-Scribio.md`, v0.5) e al **mockup** prodotto in Claude Design.
> **Scopo**: dare a Claude Code una specifica implementativa concreta per costruire l'MVP (Fase 0 del PRD), riducendo le assunzioni arbitrarie.
> **Target**: app desktop **Windows**, local-only, single-user (Andrea).
> **Autore**: Andrea Iaccino — **Data**: 17 giugno 2026
> **Verifica fonti (17 giu 2026)**: versioni e API di Electron, OpenAI Structured Outputs e PyAudioWPatch verificate via web. Vedi note inline.

---

## 0. Come usare questi tre documenti

- **PRD** = cosa e perché (visione, requisiti, scope).
- **Build spec** (questo) = come (stack, contratti, milestone, criteri di "fatto").
- **Mockup Claude Design** = riferimento visivo per la UI React.

**Regola operativa per Claude Code**: procedere **una milestone alla volta** (§9), fermarsi al criterio di accettazione di ciascuna, e **non passare alla successiva finché la precedente non è verificata sulla macchina Windows reale**. Non implementare feature marcate "fuori scope MVP" (§10).

---

## 1. Scope dell'MVP

**Dentro**: app Electron + UI React; cattura audio Windows (loopback + mic) via sidecar Python; trascrizione locale con faster-whisper; appunti grezzi; enhancement note via OpenAI (BYOK); storage locale SQLite; ricerca full-text; "Ask" sulla singola riunione; settings.

**Fuori scope MVP** (rimandati a Fase 1+ del PRD): backend FastAPI, sync, multi-utente, **MCP/Hermes**, ricerca semantica/vettoriale, export Notion/Drive, macOS, multi-provider LLM (solo OpenAI ora), recipe avanzate, matching Google Calendar.

> Lasciare però le **interfacce astratte** (layer LLM, schema dati) compatibili con questi sviluppi futuri, senza implementarli.

---

## 2. Stack tecnologico (versioni)

> Pinnare le versioni esatte all'init del progetto. Indicazioni:

| Ambito | Tecnologia | Versione |
|---|---|---|
| Runtime JS | Node.js | 24 LTS (allineato al Node bundlato da Electron) |
| Desktop shell | Electron | **41+** latest stable (cadenza 8 settimane; bundla Chromium 146 + Node 24; supportate solo le ultime 3 major), pinnata all'init |
| Scaffolding | electron-vite | latest |
| UI | React + TypeScript | React 19, TS strict |
| Styling | (come da mockup) Tailwind o CSS-in-JS | a scelta, coerente col mockup |
| DB locale | SQLite via `better-sqlite3` | latest; `electron-rebuild` per il native build |
| Full-text search | SQLite **FTS5** (incluso in better-sqlite3) | — |
| Secure storage | Electron `safeStorage` | — |
| LLM | OpenAI Node SDK (`openai`) | latest — usare **Structured Outputs** (vedi §7) |
| Sidecar runtime | Python | 3.12 (wheel PyAudioWPatch disponibili 3.7–3.13) |
| Cattura audio | `PyAudioWPatch` (pyaudiowpatch) | 0.2.12.8 (rilascio gen 2026) — WASAPI loopback |
| STT | `faster-whisper` (CTranslate2) | latest |
| VAD | **VAD integrato di faster-whisper** (`vad_filter=True`) | — (no dipendenza separata) |
| Packaging app | `electron-builder` | latest |
| Packaging sidecar | `PyInstaller` (onedir) | latest |

**Linguaggio**: tutto il lato JS in **TypeScript strict**. Sidecar in Python con type hints.

---

## 3. Architettura MVP (concreta)

Tre processi, audio confinato in Python:

```
┌─────────────────────────────────────────────────────────┐
│ Electron App                                              │
│                                                           │
│  ┌───────────────┐   IPC (preload/    ┌────────────────┐ │
│  │ Renderer       │   contextBridge)   │ Main (Node/TS) │ │
│  │ React UI       │◄──────────────────►│ - SQLite        │ │
│  │ (dal mockup)   │                    │ - OpenAI enhance│ │
│  └───────────────┘                    │ - safeStorage   │ │
│                                        │ - spawn sidecar │ │
│                                        └───────┬────────┘ │
└────────────────────────────────────────────────┼─────────┘
                                                   │ stdin/stdout JSONL
                                          ┌────────▼────────┐
                                          │ Python sidecar   │
                                          │ - WASAPI capture │
                                          │   (loopback+mic) │
                                          │ - faster-whisper │
                                          │ → emette segments│
                                          └──────────────────┘
```

**Principi**:
- L'**audio non lascia mai Python**. Verso Node viaggiano solo i **segmenti di transcript** (testo) e i messaggi di controllo. Payload IPC piccoli.
- **Enhancement e dati stanno in Node/TS** (main process). Il sidecar fa una cosa sola: catturare e trascrivere.
- Local-first: nessun server, nessuna rete salvo le chiamate OpenAI per l'enhancement.

---

## 4. Struttura del repository

```
scribio/
├─ package.json
├─ electron.vite.config.ts
├─ tsconfig.json
├─ src/
│  ├─ main/                  # Electron main (Node/TS)
│  │  ├─ index.ts            # bootstrap, finestra, lifecycle
│  │  ├─ ipc.ts             # handler IPC verso renderer
│  │  ├─ sidecar.ts          # spawn + gestione processo Python, parsing JSONL
│  │  ├─ db/
│  │  │  ├─ schema.sql       # DDL (§5)
│  │  │  ├─ db.ts            # better-sqlite3 init, migrazioni
│  │  │  └─ repositories.ts  # query tipizzate (meetings, segments, notes…)
│  │  ├─ llm/
│  │  │  ├─ provider.ts      # interfaccia LLMProvider (astratta)
│  │  │  ├─ openai.ts        # implementazione OpenAI
│  │  │  └─ enhance.ts       # orchestrazione enhancement (prompt §7)
│  │  └─ secrets.ts          # safeStorage per API key
│  ├─ preload/
│  │  └─ index.ts            # contextBridge: API tipizzata per il renderer
│  ├─ renderer/              # React UI (dal mockup)
│  │  ├─ App.tsx
│  │  ├─ routes/             # Home, Live, Meeting, Settings
│  │  ├─ components/
│  │  └─ lib/                # client IPC tipizzato, stato
│  └─ shared/
│     └─ types.ts            # tipi condivisi main/renderer/sidecar (IPC, entità)
├─ sidecar/                  # Python
│  ├─ main.py                # loop stdin/stdout JSONL
│  ├─ capture.py             # WASAPI loopback + mic (pyaudiowpatch)
│  ├─ transcribe.py          # faster-whisper, vad_filter
│  ├─ protocol.py            # schema messaggi
│  ├─ requirements.txt
│  └─ build.spec             # PyInstaller
└─ resources/                # icone, asset
```

---

## 5. Schema dati — DDL SQLite (`schema.sql`)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE meetings (
  id           TEXT PRIMARY KEY,            -- uuid v4
  title        TEXT NOT NULL,
  template_id  TEXT,
  language     TEXT NOT NULL DEFAULT 'it',
  status       TEXT NOT NULL,               -- recording|transcribing|enhancing|ready|error
  started_at   INTEGER NOT NULL,            -- epoch ms
  ended_at     INTEGER,
  participants TEXT,                        -- JSON array di stringhe
  consent_flag INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE transcript_segments (
  id         TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  speaker    TEXT NOT NULL,                 -- 'me' | 'others'
  ts_start   REAL NOT NULL,                 -- secondi dall'inizio
  ts_end     REAL,
  text       TEXT NOT NULL,
  seq        INTEGER NOT NULL
);
CREATE INDEX idx_segments_meeting ON transcript_segments(meeting_id, seq);

CREATE TABLE raw_notes (
  meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE enhanced_notes (
  meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL,
  summary    TEXT,
  model      TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE action_items (
  id         TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  owner      TEXT,
  due_date   TEXT,
  status     TEXT NOT NULL DEFAULT 'open',  -- open|done
  seq        INTEGER
);
CREATE INDEX idx_actions_meeting ON action_items(meeting_id);

CREATE TABLE templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT,
  prompt     TEXT NOT NULL,                 -- istruzioni specifiche del template
  structure  TEXT,                          -- struttura attesa della nota (markdown)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Ricerca full-text (MVP). La semantica/vettoriale è Fase 1.
CREATE VIRTUAL TABLE search_index USING fts5(
  meeting_id UNINDEXED,
  kind,                                     -- 'enhanced'|'transcript'|'raw'
  content
);
```

> Schema concettualmente identico al futuro Postgres (Fase 1) per rendere semplice il sync. Non aggiungere colonne non previste senza motivo.

---

## 6. Contratti IPC

### 6.1 Main ↔ Sidecar (Python) — JSONL su stdin/stdout

Una riga = un oggetto JSON. **Comandi** (main → sidecar, su stdin):

```jsonc
{ "cmd": "list_devices" }
{ "cmd": "start", "session_id": "uuid", "stt_model": "medium", "language": "it",
  "mic_index": 3, "loopback_index": 7 }
{ "cmd": "stop", "session_id": "uuid" }
{ "cmd": "ping" }
```

**Eventi** (sidecar → main, su stdout):

```jsonc
{ "event": "ready" }
{ "event": "devices", "mic": [{"index":3,"name":"..."}], "loopback": [{"index":7,"name":"..."}] }
{ "event": "status", "session_id": "uuid", "state": "capturing" }   // capturing|finalizing
{ "event": "segment", "session_id": "uuid", "speaker": "others",
  "ts_start": 12.3, "ts_end": 15.1, "text": "...", "seq": 4 }
{ "event": "stopped", "session_id": "uuid" }
{ "event": "error", "message": "descrizione", "fatal": true }
```

Regole: il sidecar è stateless tra sessioni; ogni errore fatale → evento `error` con `fatal:true` e uscita pulita; il main rilancia il sidecar se muore.

### 6.2 Renderer ↔ Main (Electron, via preload/contextBridge)

API tipizzata esposta al renderer (tipi in `src/shared/types.ts`):

```ts
window.scribio = {
  devices: { list(): Promise<DeviceList> },
  session: {
    start(opts): Promise<{ meetingId: string }>,
    stop(meetingId): Promise<void>,
    onSegment(cb: (s: Segment) => void): Unsubscribe,
    onStatus(cb: (s: Status) => void): Unsubscribe,
  },
  meetings: {
    list(filter?): Promise<MeetingListItem[]>,
    get(id): Promise<MeetingDetail>,
    saveRawNotes(id, md): Promise<void>,
    enhance(id, templateId?): Promise<void>,   // chiama OpenAI
    remove(id): Promise<void>,
  },
  search: { query(q: string): Promise<SearchResult[]> },
  ask: { meeting(id, question): Promise<string> },
  templates: { list(): Promise<Template[]>, upsert(t): Promise<void> },
  settings: {
    get(): Promise<Settings>,
    setOpenAIKey(key: string): Promise<void>,   // → safeStorage
    set(partial): Promise<void>,
  },
};
```

> `contextIsolation: true`, `nodeIntegration: false`. Nessun accesso diretto a Node dal renderer: tutto via questa API.

---

## 7. Engine di enhancement + prompt

Flusso (in `main/llm/enhance.ts`): a `stop` riuscito → recupera transcript + raw notes + template → costruisce il prompt → chiama OpenAI → parsa l'output → salva `enhanced_notes` + `action_items` + aggiorna `search_index` → status `ready`.

Output richiesto al modello: oggetto strutturato con `enhanced_md`, `summary`, `action_items[]`.

**Usare OpenAI Structured Outputs, non il prompt-and-pray.** Verificato (giu 2026): la modalità affidabile è `response_format: { type: "json_schema", strict: true }` (Chat Completions API), che **garantisce l'aderenza allo schema** — il modello non può produrre output non conforme. La vecchia "JSON mode" (`type: "json_object"`) è considerata legacy: garantisce JSON valido ma non lo schema. Nel Node SDK conviene definire lo schema in **Zod** e passarlo con l'helper `zodResponseFormat` da `openai/helpers/zod`.

> Nota: esiste anche la più recente **Responses API**, dove la stessa cosa si fa con `text.format` invece di `response_format`. Per l'MVP va benissimo Chat Completions + `response_format`, più semplice e documentato. Il modello scelto deve supportare gli Structured Outputs (modello recente, famiglia GPT-5 / variante mini economica — pick di default in §12).

Schema Zod (in `main/llm/enhance.ts`):

```ts
import { z } from "zod";
const EnhancementSchema = z.object({
  enhanced_md: z.string(),                 // note finali in markdown, secondo il template
  summary: z.string(),                     // 2-4 frasi
  action_items: z.array(z.object({
    text: z.string(),
    owner: z.string().nullable(),
    due_date: z.string().nullable(),
  })),
});
```

**Gestire il rifiuto come errore di prima classe**: con gli Structured Outputs il modello può restituire un oggetto `refusal` invece dei dati — controllarlo prima di parsare, e in tal caso marcare la riunione `error` con messaggio chiaro in UI.

### 7.1 System prompt (italiano) — bozza da affinare

```
Sei l'assistente di note di riunione di Scribio. Ricevi gli APPUNTI GREZZI presi a mano
dall'utente durante una riunione e il TRANSCRIPT completo (con speaker "Tu" = chi prende
appunti e "Altri" = gli altri partecipanti). Il tuo compito è produrre note finali pulite
e strutturate.

REGOLE FONDAMENTALI:
- Gli appunti grezzi dell'utente sono l'ÀNCORA: rispetta la loro struttura, i loro temi e
  il loro ordine. Non li stravolgere. Li arricchisci e li completi usando il transcript.
- Riempi i buchi e aggiungi dettaglio SOLO sulla base del transcript. NON inventare nulla,
  non aggiungere fatti non presenti né nelle note né nel transcript.
- Se un punto degli appunti non trova riscontro nel transcript, mantienilo comunque ma non
  inventarci sopra.
- Scrivi in italiano, in modo asciutto e professionale. Niente fronzoli, niente preamboli.
- Estrai gli ACTION ITEM: cose da fare, impegni presi, follow-up. Per ognuno indica il
  testo e, se deducibile dal transcript, l'owner. Non forzare owner o scadenze incerte.
- Produci un SUMMARY di 2-4 frasi che catturi gli esiti e le decisioni chiave.

FORMATO DI OUTPUT: la struttura dei campi (enhanced_md, summary, action_items) è imposta
dallo schema a livello di API, quindi non serve descriverla qui. Concentrati sulla qualità:
enhanced_md deve seguire la struttura del template e degli appunti; summary 2-4 frasi;
action_items con owner/due_date a null se non chiaramente deducibili.
```

### 7.2 User message (composto a runtime)

```
TEMPLATE (struttura attesa della nota):
{template.structure || "struttura libera, segui gli appunti dell'utente"}
{template.prompt opzionale}

APPUNTI GREZZI DELL'UTENTE:
{raw_notes.content_md || "(nessun appunto)"}

TRANSCRIPT:
{segments formattati come "[mm:ss] Tu/Altri: testo", in ordine di seq}

METADATI: titolo="{title}", data="{started_at}", durata="{...}"
```

> Template MVP da seedare nel DB: **"Call generica"** e **"Call vendita / discovery"** (quest'ultimo con struttura: Contesto cliente, Esigenze emerse, Obiezioni, Prossimi passi, Action items).

---

## 8. Sidecar Python — note implementative

- **Cattura**: due stream WASAPI separati — **loopback** del device di output di default (= "Altri") e **microfono** (= "Tu"). Verificato (giu 2026): in PyAudioWPatch i device loopback compaiono come **device di input virtuali duplicati in fondo alla lista**; il loopback di default si ottiene via la host API WASAPI (`get_host_api_info_by_type(paWASAPI)` → default output → analogo loopback). Partire dall'esempio ufficiale `pawp_record_wasapi_loopback.py` del repo. Downmix a **16 kHz mono** per stream.
- **Attenzione nota**: il punto dove ci si incastra di solito è la **gestione di buffer e sample-rate** (i device loopback girano spesso a 44.1/48 kHz stereo → resampling corretto a 16 kHz mono prima dell'STT). Trattarlo con cura, non a occhio.
- **VAD + chunking**: usare il `vad_filter=True` integrato in faster-whisper. Accumulare audio per stream e trascrivere a chunk delimitati dai silenzi (target ~5–10 s di parlato), per dare un transcript live near-real-time.
- **STT**: **una sola istanza** del modello faster-whisper condivisa tra i due stream (serializza le richieste) per contenere RAM. Modello configurabile (`small`/`medium`/`large-v3`); su CPU usare quantizzazione `int8`. Lingua `it`.
- **Speaker**: derivato dallo stream di provenienza (mic → "me", loopback → "others"). Niente diarizzazione.
- **Output**: ogni chunk trascritto → evento `segment` con `seq` incrementale per sessione.
- **Robustezza**: se un device non è disponibile o WASAPI fallisce → evento `error` `fatal:true`, **non** simulare audio finto.

---

## 9. Milestone ordinate (con criteri di accettazione)

> Ogni milestone va **verificata sulla macchina Windows reale** prima di procedere.

### M0 — Spike audio (Python standalone, NO Electron) ⚠️ de-risk prioritario
Script Python isolato che apre loopback + mic con PyAudioWPatch e li trascrive con
faster-whisper, stampando i segmenti a console con etichetta speaker. Partire dall'esempio
ufficiale `pawp_record_wasapi_loopback.py` (repo s0d3s/PyAudioWPatch) ed estenderlo al mic.
**AC**: con una call/video in riproduzione + voce al microfono, la console mostra in
near-real-time due flussi di testo italiano corretti (Tu / Altri). Se M0 non passa, fermarsi
e risolvere: tutto il resto dipende da questo.

### M1 — Scheletro app
electron-vite + React + TS che boota; finestra; routing Home/Live/Meeting/Settings;
sistema di stile coerente col mockup; SQLite inizializzato con lo schema §5.
**AC**: l'app si avvia, si naviga tra le 4 schermate, il file DB viene creato con le tabelle.

### M2 — Integrazione sidecar + live transcript
Main spawna il sidecar (PyInstaller in dev: invocare Python direttamente va bene),
handshake `ready`, comandi `start`/`stop`, i `segment` arrivano nella vista Live in
near-real-time con etichette Tu/Altri.
**AC**: premo Registra, parlo, vedo il transcript live a destra; premo Termina, il sidecar
si ferma pulito.

### M3 — Persistenza + appunti grezzi
Notepad nella vista Live; allo stop salva meeting + segments + raw notes su SQLite; la Home
elenca le riunioni passate; riapertura di una riunione mostra transcript + appunti.
**AC**: concludo una riunione, la vedo in lista, la riapro e ritrovo tutto.

### M4 — Enhancement OpenAI
Allo stop, chiamata OpenAI con prompt §7 (key da safeStorage); salva enhanced_notes +
action_items + summary; vista Meeting con toggle "I miei appunti / Enhanced", lista action
item, transcript collassabile.
**AC**: dopo una riunione compaiono note enhanced strutturate coerenti col template, gli
action item sono estratti, il summary è sensato. Errore chiaro se manca la API key.

### M5 — Settings + ricerca + ask
Schermata Settings (API key OpenAI, modello OpenAI, dimensione modello STT, device audio);
ricerca full-text FTS5 su note e transcript; "Ask" sulla singola riunione (transcript+note
nel contesto → OpenAI).
**AC**: imposto la key, la ricerca trova riunioni per parola chiave, l'Ask risponde citando
contenuti della riunione.

### M6 — Packaging Windows
electron-builder + sidecar via PyInstaller (onedir, come extraResources); installer Windows;
modello whisper **scaricato al primo avvio** in userData (non incluso nell'installer).
**AC**: installo su Windows, configuro la key, eseguo un ciclo completo (registra → note
enhanced → ricerca) senza toolchain di sviluppo presente.

---

## 10. Packaging — note di rischio (M6)

- **Sidecar Python in Electron**: PyInstaller in modalità **onedir**, incluso come
  `extraResources`; il main lo invoca via path assoluto a runtime. In dev si può invocare
  l'interprete Python direttamente.
- **faster-whisper / CTranslate2 con PyInstaller** è notoriamente delicato: possibili
  `hidden imports` e DLL mancanti. Prevedere iterazione. **Non bundlare i modelli** (pesanti):
  scaricarli al primo avvio.
- **better-sqlite3** è un native module: serve `electron-rebuild` (o `@electron/rebuild`).
- Le **API key** non devono MAI finire in chiaro nel DB, nei log o nel bundle: solo
  `safeStorage` (Windows Credential Manager).

---

## 11. Verifica e guardrail per l'agente

**Testing**:
- Audio (M0/M2): verifica manuale sulla macchina reale, non simulabile in CI.
- Per sviluppare la UI senza audio: prevedere un **sidecar mock** che emette segmenti finti.
- Unit test su: parsing dell'output LLM (JSON robusto), repository DB, costruzione prompt.

**Guardrail**:
- TypeScript strict; niente `any` non giustificati.
- Moduli a **singola responsabilità** (capture, STT, db, llm, ipc separati).
- L'audio resta in Python; verso Node solo testo/controllo.
- Non implementare nulla di "fuori scope MVP" (§1).
- Se la cattura audio fallisce sul target, **fallire in modo esplicito** e mostrarlo in UI:
  mai mascherare con dati finti.
- Lasciare astratte (ma non implementate) le estensioni Fase 1: `LLMProvider` per altri
  provider, schema dati compatibile con Postgres/sync, punto di innesto per MCP.

---

## 12. Riepilogo decisioni ancora da prendere (dal PRD §10)

Da confermare prima/durante M0–M4 (non bloccano l'inizio):
- Dimensione modello whisper di default (dipende dall'hardware: GPU? RAM?).
- Modello OpenAI di default per l'enhancement (deve **supportare gli Structured Outputs** — modello recente, es. famiglia GPT-5 in variante economica).
- Quanto spingere il live near-real-time vs fallback batch a fine call su macchine senza GPU.
