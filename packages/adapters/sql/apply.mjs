// Applies the hand-written SQL files in this folder (sorted by name), one
// statement at a time and outside any transaction, so `CREATE INDEX
// CONCURRENTLY` works. deploy.sh runs it right before `drizzle-kit push`;
// drizzle then finds the indexes already there and skips them, instead of
// building them with a plain CREATE INDEX that blocks writes.
//
// Files must be idempotent (IF NOT EXISTS) because every deploy runs them all.
// Statements are split on ';' at the end of a line; `--` comments are dropped.
//
// Usage:  node packages/adapters/sql/apply.mjs      (or: pnpm db:sql:pg)
// Reads the same database URL as drizzle.pg.config.ts.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (!process.env[key]) process.env[key] = val
  }
}

// Same precedence as drizzle.pg.config.ts
const envLocalPath = path.resolve(here, '../../../apps/web/.env.local')
const envProdPath = path.resolve(here, '../../../apps/web/.env')
if (fs.existsSync(envLocalPath)) loadEnvFile(envLocalPath)
else if (fs.existsSync(envProdPath)) loadEnvFile(envProdPath)

const dbUrl =
  process.env.LOCAL_PG_URI ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.PG_URI ||
  'postgresql://oni_admin:oni_password@localhost:5432/oni_saas_local'

function statements(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean)
}

const indexNames = (stmts) =>
  stmts
    .map((s) => s.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w.]+"?)/i)?.[1])
    .filter(Boolean)
    .map((n) => n.replaceAll('"', ''))

async function invalidIndexes(client, names) {
  if (names.length === 0) return []
  const { rows } = await client.query(
    `SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE NOT i.indisvalid AND c.relname = ANY($1)`,
    [names],
  )
  return rows.map((r) => r.relname)
}

async function run(client, stmts) {
  for (const stmt of stmts) {
    const started = Date.now()
    await client.query(stmt)
    console.log(`   ✔ ${stmt.split('\n')[0].slice(0, 90)} (${Date.now() - started} ms)`)
  }
}

async function main() {
  const files = fs.readdirSync(here).filter((f) => f.endsWith('.sql')).sort()
  if (files.length === 0) return console.log('   ℹ No SQL files')

  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()
  try {
    // Index builds can take a while on big tables; never let a default timeout abort them
    await client.query('SET statement_timeout = 0')

    for (const file of files) {
      console.log(`   ▶ ${file}`)
      const stmts = statements(fs.readFileSync(path.join(here, file), 'utf-8'))
      const names = indexNames(stmts)

      // A concurrent build that failed earlier leaves an INVALID index that
      // IF NOT EXISTS would skip forever: drop it so it gets rebuilt.
      for (const name of await invalidIndexes(client, names)) {
        console.log(`   ⚠ Dropping INVALID index ${name} to rebuild it`)
        await client.query(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`)
      }

      await run(client, stmts)

      const stillInvalid = await invalidIndexes(client, names)
      if (stillInvalid.length > 0) throw new Error(`Index build left INVALID: ${stillInvalid.join(', ')}`)
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(`   ❌ SQL apply failed: ${err.message}`)
  process.exit(1)
})
