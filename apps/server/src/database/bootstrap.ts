import appDataSource from './data-source'

const CORE_TABLES = [
  'knowledge_bases',
  'knowledge_chunks',
  'knowledge_document',
  'workspace_conversation',
  'workspace_message'
] as const

const MAX_CONNECT_ATTEMPTS = 30
const CONNECT_RETRY_DELAY_MS = 2000

async function bootstrapDatabase() {
  await connectWithRetry()

  try {
    const coreTables = await getExistingCoreTables()

    if (coreTables.length === 0) {
      await appDataSource.synchronize()
      console.log('[db:bootstrap] Base schema created from entities')
    } else if (coreTables.length !== CORE_TABLES.length) {
      const missingTables = CORE_TABLES.filter((tableName) => !coreTables.includes(tableName))

      throw new Error(
        [
          'Detected a partially initialized database.',
          `Existing core tables: ${coreTables.join(', ') || '(none)'}`,
          `Missing core tables: ${missingTables.join(', ')}`
        ].join(' ')
      )
    } else {
      console.log('[db:bootstrap] Base schema already exists, skip schema sync')
    }

    const migrations = await appDataSource.runMigrations({ transaction: 'each' })
    console.log(`[db:bootstrap] Applied ${migrations.length} migration(s)`)
  } finally {
    await appDataSource.destroy()
  }
}

async function connectWithRetry() {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
    try {
      await appDataSource.initialize()
      console.log(`[db:bootstrap] Database connected on attempt ${attempt}`)
      return
    } catch (error) {
      lastError = error

      if (attempt === MAX_CONNECT_ATTEMPTS) {
        break
      }

      await delay(CONNECT_RETRY_DELAY_MS)
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to connect to database during bootstrap')
}

async function getExistingCoreTables(): Promise<string[]> {
  const rows = (await appDataSource.query(
    `
      SELECT table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ANY($1)
      ORDER BY table_name
    `,
    [CORE_TABLES]
  )) as Array<{ tableName: string }>

  return rows.map((row) => row.tableName)
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

bootstrapDatabase().catch((error) => {
  console.error('[db:bootstrap] Failed:', error)
  process.exitCode = 1
})
