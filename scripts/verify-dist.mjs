#!/usr/bin/env node
// Smoke check pre-release: verifica che gli artefatti in dist/ combacino con la
// version di package.json. Nasce dal bug 0.1.2, dove latest.yml era rimasto a 0.1.1
// (publish a metà) → l'auto-update puntava alla versione sbagliata.
// Esce non-zero con un messaggio chiaro se qualcosa non torna.

import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

const fail = (msg) => {
  console.error(`✗ verify-dist: ${msg}`)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const ver = pkg.version
if (!ver) fail('version mancante in package.json')

const exe = join(dist, `Scribio-Setup-${ver}.exe`)
const blockmap = `${exe}.blockmap`
const latest = join(dist, 'latest.yml')

if (!existsSync(exe)) fail(`installer mancante: ${exe}`)
if (statSync(exe).size === 0) fail(`installer vuoto (0 byte): ${exe}`)
if (!existsSync(blockmap)) fail(`blockmap mancante: ${blockmap} (download differenziale rotto)`)
if (!existsSync(latest)) fail(`latest.yml mancante: ${latest}`)

const yml = readFileSync(latest, 'utf-8')
const m = yml.match(/^version:\s*(.+)$/m)
if (!m) fail('latest.yml senza campo "version:"')
const ymlVer = m[1].trim()
if (ymlVer !== ver) {
  fail(`mismatch versione: package.json=${ver} ma latest.yml=${ymlVer} (publish a metà? ribuilda)`)
}

const sizeMb = (statSync(exe).size / 1e6).toFixed(1)
console.log(`✓ verify-dist: v${ver} ok (exe ${sizeMb}MB, blockmap, latest.yml allineati)`)
