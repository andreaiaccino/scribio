import { join } from 'node:path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import schema from './schema.sql?raw'

let db: Database.Database | null = null

/** Inizializza (idempotente) il DB SQLite in userData e applica lo schema. */
export function initDb(): Database.Database {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'scribio.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(schema)

  seedTemplates(db)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('DB non inizializzato: chiamare initDb() prima.')
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

/** Seed dei template MVP (BUILD-SPEC §7.2): solo se la tabella è vuota. */
function seedTemplates(database: Database.Database): void {
  const count = database
    .prepare('SELECT COUNT(*) AS n FROM templates')
    .get() as { n: number }
  if (count.n > 0) return

  const now = Date.now()
  const insert = database.prepare(
    `INSERT INTO templates (id, name, type, prompt, structure, created_at, updated_at)
     VALUES (@id, @name, @type, @prompt, @structure, @created_at, @updated_at)`
  )

  insert.run({
    id: 'tpl-generica',
    name: 'Call generica',
    type: 'generic',
    prompt:
      'Riunione generica. Segui la struttura degli appunti dell’utente; ' +
      'organizza in sezioni tematiche chiare con bullet asciutti.',
    structure: '',
    created_at: now,
    updated_at: now
  })

  insert.run({
    id: 'tpl-vendita',
    name: 'Call vendita / discovery',
    type: 'sales',
    prompt:
      'Call di vendita/discovery. Estrai contesto cliente, esigenze, obiezioni e ' +
      'prossimi passi.',
    structure:
      '## Contesto cliente\n## Esigenze emerse\n## Obiezioni\n## Prossimi passi',
    created_at: now,
    updated_at: now
  })
}
