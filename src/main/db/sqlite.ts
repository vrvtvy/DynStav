import initSqlJs, { SqlJsStatic } from 'sql.js'
import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync, readdirSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getDataPath } from '../paths'
import { BlockDailyStats, BlockInfo, QueryParams, ChatSession, ChatSessionMessage } from '../../renderer/src/types'
import log from 'electron-log/main'
import { DataRepository } from './interface'

let SQL: SqlJsStatic

type SqlJsDatabase = any

function formatDate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export class SqliteRepository implements DataRepository {
  private db!: SqlJsDatabase
  private dbPath: string

  constructor() {
    // 旧→新路径迁移
    const oldPath = join(app.getAppPath(), 'data', 'dynstav.db')
    const newPath = getDataPath('dynstav.db')
    if (existsSync(oldPath) && !existsSync(newPath)) {
      console.log('[DB] 迁移旧数据库到新路径:', newPath)
      copyFileSync(oldPath, newPath)
    }
    this.dbPath = newPath
  }

  async init(): Promise<void> {
    SQL = await initSqlJs()

    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath)
      this.db = new SQL.Database(buffer)
    } else {
      this.db = new SQL.Database()
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS block_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_code TEXT NOT NULL,
        block_name TEXT NOT NULL,
        date TEXT NOT NULL,
        stock_count INTEGER NOT NULL,
        avg_change_percent REAL NOT NULL,
        avg_price REAL NOT NULL,
        avg_amount REAL NOT NULL,
        total_amount REAL NOT NULL,
        avg_turnover_rate REAL NOT NULL,
        UNIQUE(block_code, date)
      )
    `)

    const savedSorts = this.saveSortOrders()
    this.fixBlocksTable()
    this.initChatTables()
    this.runMigrations()
    this.restoreSortOrders(savedSorts)
    this.save()
  }

  private saveSortOrders(): Map<string, number> {
    const map = new Map<string, number>()
    try {
      const cols = this.db.exec("PRAGMA table_info(blocks)")[0]?.values?.map((v: any) => v[1]) || []
      if (cols.includes('code') && cols.includes('sort_order')) {
        const rows = this.db.exec("SELECT code, sort_order FROM blocks")[0]?.values || []
        for (const row of rows) {
          map.set(String(row[0]), Number(row[1]))
        }
      }
    } catch { }
    return map
  }

  private restoreSortOrders(map: Map<string, number>): void {
    if (map.size === 0) return
    for (const [code, order] of map) {
      this.db.run("UPDATE blocks SET sort_order = ? WHERE code = ?", [order, code])
    }
    this.save()
  }

  private fixBlocksTable(): void {
    const cols = this.db.exec("PRAGMA table_info(blocks)")[0]?.values?.map((v: any) => v[1]) || []
    if (cols.length > 0 && !cols.includes('code')) {
      console.log('[DB] blocks 表结构异常，重建')
      this.db.run("DROP TABLE IF EXISTS blocks")
    }
    this.db.run(`
      CREATE TABLE IF NOT EXISTS blocks (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `)
  }

  private runMigrations(): void {
    const version = this.db.exec("PRAGMA user_version")[0]?.values[0]?.[0] ?? 0
    if (version < 1) {
      console.log('[DB] 运行迁移 v1: 初始化 blocks 表数据')
      this.db.run(`
        INSERT OR IGNORE INTO blocks (code, name, sort_order)
        SELECT DISTINCT block_code, block_name, 0 FROM block_stats
      `)
      this.db.run("PRAGMA user_version = 1")
    }
  }

  private atomicWrite(filePath: string, buffer: Buffer): void {
    const tmpPath = `${filePath}.tmp`
    writeFileSync(tmpPath, buffer)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
    renameSync(tmpPath, filePath)
  }

  backup(): void {
    try {
      const data = this.db.export()
      const buffer = Buffer.from(data)

      const backupDir = getDataPath('data-backup')
      if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true })

      const dateStr = formatDate()
      const targetName = `dynstav-${dateStr}.db`
      const targetPath = join(backupDir, targetName)
      this.atomicWrite(targetPath, buffer)

      this.rotateBackups()
    } catch (e) {
      log.error('[DB] backup failed:', e)
    }
  }

  listBackups(): { name: string; path: string }[] {
    try {
      const backupDir = getDataPath('data-backup')
      if (!existsSync(backupDir)) return []
      const entries = readdirSync(backupDir)
      const files = entries
        .filter((f) => f.endsWith('.db') && /^dynstav-\d{4}-\d{2}-\d{2}\.db$/.test(f))
        .map((f) => ({ name: f, path: join(backupDir, f) }))
        .sort((a, b) => b.name.localeCompare(a.name))
      return files
    } catch (e) {
      log.error('[DB] listBackups failed:', e)
      return []
    }
  }

  rotateBackups(keepDays = 40): void {
    try {
      const backupDir = getDataPath('data-backup')
      if (!existsSync(backupDir)) return
      const entries = readdirSync(backupDir)
      const dayFiles = entries.filter((f) => /^dynstav-\d{4}-\d{2}-\d{2}\.db$/.test(f))
      const sorted = dayFiles.sort((a, b) => b.localeCompare(a))
      const toDelete = sorted.slice(keepDays)
      for (const f of toDelete) {
        try {
          unlinkSync(join(backupDir, f))
        } catch (e) {
          log.warn('[DB] rotate remove failed:', f, e)
        }
      }
    } catch (e) {
      log.error('[DB] rotateBackups failed:', e)
    }
  }

  restoreFrom(backupPath: string): void {
    try {
      if (!existsSync(backupPath)) throw new Error('backup not found')
      const buffer = readFileSync(backupPath)
      const newDb = new SQL.Database(buffer)

      try {
        this.db.close()
      } catch { }
      this.db = newDb

      this.save()
    } catch (e) {
      log.error('[DB] restoreFrom failed:', e)
      throw e
    }
  }

  getBlocks(): BlockInfo[] {
    const stmt = this.db.prepare(`
      SELECT b.code, b.name, b.sort_order,
        s.stock_count, s.avg_change_percent
      FROM blocks b
      LEFT JOIN block_stats s ON s.block_code = b.code
        AND s.date = (SELECT MAX(s2.date) FROM block_stats s2 WHERE s2.block_code = b.code)
      ORDER BY b.sort_order DESC, b.code ASC
    `)
    const rows: BlockInfo[] = []
    while (stmt.step()) {
      const row = stmt.getAsObject() as any
      rows.push({
        code: row.code,
        name: row.name,
        sortOrder: row.sort_order,
        stockCount: row.stock_count,
        avgChangePercent: row.avg_change_percent
      })
    }
    stmt.free()
    return rows
  }

  saveStats(stats: BlockDailyStats[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO block_stats
        (block_code, block_name, date, stock_count, avg_change_percent,
         avg_price, avg_amount, total_amount, avg_turnover_rate)
      VALUES
        ($block_code, $block_name, $date, $stock_count, $avg_change_percent,
         $avg_price, $avg_amount, $total_amount, $avg_turnover_rate)
    `)

    for (const item of stats) {
      stmt.bind({
        $block_code: item.blockCode,
        $block_name: item.blockName,
        $date: item.date,
        $stock_count: item.stockCount,
        $avg_change_percent: item.avgChangePercent,
        $avg_price: item.avgPrice,
        $avg_amount: item.avgAmount,
        $total_amount: item.totalAmount,
        $avg_turnover_rate: item.avgTurnoverRate
      })
      stmt.step()
      stmt.reset()
    }
    stmt.free()
    this.save()
  }

  deleteStatsByDate(date: string): void {
    this.db.run('DELETE FROM block_stats WHERE date = ?', [date])
    this.save()
  }

  queryStats(params: QueryParams): BlockDailyStats[] {
    let sql = 'SELECT * FROM block_stats WHERE 1=1'
    const binds: Record<string, string> = {}

    if (params.startDate) {
      sql += ' AND date >= $start_date'
      binds['$start_date'] = params.startDate
    }
    if (params.endDate) {
      sql += ' AND date <= $end_date'
      binds['$end_date'] = params.endDate
    }
    if (params.blockCode) {
      sql += ' AND block_code = $block_code'
      binds['$block_code'] = params.blockCode
    }

    sql += ' ORDER BY date ASC'

    log.debug('queryStats SQL:', sql.replace(/\n\s*/g, ' '), 'binds:', binds)

    const stmt = this.db.prepare(sql)
    stmt.bind(binds)

    const results: BlockDailyStats[] = []
    while (stmt.step()) {
      const r = stmt.getAsObject() as any
      results.push({
        blockCode: r.block_code,
        blockName: r.block_name,
        date: r.date,
        stockCount: r.stock_count,
        avgChangePercent: r.avg_change_percent,
        avgPrice: r.avg_price,
        avgAmount: r.avg_amount,
        totalAmount: r.total_amount,
        avgTurnoverRate: r.avg_turnover_rate
      })
    }
    stmt.free()
    return results
  }

  getLatestDate(): string | null {
    const stmt = this.db.prepare('SELECT MAX(date) as max_date FROM block_stats')
    if (stmt.step()) {
      const row = stmt.getAsObject() as { max_date: string | null }
      stmt.free()
      return row.max_date
    }
    stmt.free()
    return null
  }

  saveBlockMeta(blocks: { code: string; name: string }[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO blocks (code, name, sort_order)
      VALUES ($code, $name, COALESCE((SELECT sort_order FROM blocks WHERE code = $code), 0))
    `)
    for (const b of blocks) {
      stmt.bind({ $code: b.code, $name: b.name })
      stmt.step()
      stmt.reset()
    }
    stmt.free()
    this.save()
  }

  updateBlockSort(codes: string[]): void {
    for (let i = 0; i < codes.length; i++) {
      this.db.run('UPDATE blocks SET sort_order = $order WHERE code = $code', {
        $order: codes.length - i,
        $code: codes[i]
      })
    }
    this.save()
  }

  private save(): void {
    const data = this.db.export()
    const buffer = Buffer.from(data)
    this.atomicWrite(this.dbPath, buffer)
  }

  private initChatTables(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        block_code TEXT NOT NULL,
        block_name TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        thinking TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        error INTEGER DEFAULT 0,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        reasoning_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0
      )
    `)
    // 为已有表添加 thinking 列（向后兼容迁移）
    const cols = this.db.exec("PRAGMA table_info(chat_messages)")[0]?.values?.map((v: any) => v[1]) || []
    if (cols.length > 0 && !cols.includes('thinking')) {
      this.db.run("ALTER TABLE chat_messages ADD COLUMN thinking TEXT DEFAULT ''")
    }
    // 为已有表添加 token 用量列（向后兼容迁移）
    if (cols.length > 0 && !cols.includes('input_tokens')) {
      this.db.run("ALTER TABLE chat_messages ADD COLUMN input_tokens INTEGER DEFAULT 0")
    }
    if (cols.length > 0 && !cols.includes('output_tokens')) {
      this.db.run("ALTER TABLE chat_messages ADD COLUMN output_tokens INTEGER DEFAULT 0")
    }
    if (cols.length > 0 && !cols.includes('reasoning_tokens')) {
      this.db.run("ALTER TABLE chat_messages ADD COLUMN reasoning_tokens INTEGER DEFAULT 0")
    }
    if (cols.length > 0 && !cols.includes('total_tokens')) {
      this.db.run("ALTER TABLE chat_messages ADD COLUMN total_tokens INTEGER DEFAULT 0")
    }
    // 为按板块查询会话建立索引
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_chat_sessions_block ON chat_sessions(block_code, updated_at DESC)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at ASC)`)
  }

  // ─── AI 对话历史 CRUD ───

  getChatSessions(blockCode: string): ChatSession[] {
    const stmt = this.db.prepare(`
      SELECT s.id, s.block_code, s.block_name, s.title, s.created_at, s.updated_at,
             COUNT(m.id) AS message_count
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON m.session_id = s.id
      WHERE s.block_code = $block_code
      GROUP BY s.id
      ORDER BY s.updated_at DESC
      LIMIT 50
    `)
    stmt.bind({ $block_code: blockCode })
    const results: ChatSession[] = []
    while (stmt.step()) {
      const r = stmt.getAsObject() as any
      results.push({
        id: r.id,
        blockCode: r.block_code,
        blockName: r.block_name,
        title: r.title,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        messageCount: r.message_count
      })
    }
    stmt.free()
    return results
  }

  getChatMessages(sessionId: string): ChatSessionMessage[] {
    const stmt = this.db.prepare(`
      SELECT id, session_id, role, content, thinking, created_at, error,
             input_tokens, output_tokens, reasoning_tokens, total_tokens
      FROM chat_messages
      WHERE session_id = $session_id
      ORDER BY created_at ASC
    `)
    stmt.bind({ $session_id: sessionId })
    const results: ChatSessionMessage[] = []
    while (stmt.step()) {
      const r = stmt.getAsObject() as any
      const hasUsage = r.role === 'assistant' && (r.input_tokens > 0 || r.output_tokens > 0)
      results.push({
        id: r.id,
        sessionId: r.session_id,
        role: r.role,
        content: r.content,
        thinkingContent: r.thinking || undefined,
        createdAt: r.created_at,
        error: !!r.error,
        usage: hasUsage ? {
          inputTokens: r.input_tokens || 0,
          outputTokens: r.output_tokens || 0,
          reasoningTokens: r.reasoning_tokens || 0,
          totalTokens: r.total_tokens || 0,
        } : undefined,
      })
    }
    stmt.free()
    return results
  }

  saveChatSession(session: ChatSession, messages: ChatSessionMessage[]): void {
    // upsert 会话
    this.db.run(`
      INSERT INTO chat_sessions (id, block_code, block_name, title, created_at, updated_at)
      VALUES ($id, $block_code, $block_name, $title, $created_at, $updated_at)
      ON CONFLICT(id) DO UPDATE SET
        title = $title, updated_at = $updated_at
    `, {
      $id: session.id,
      $block_code: session.blockCode,
      $block_name: session.blockName,
      $title: session.title,
      $created_at: session.createdAt,
      $updated_at: session.updatedAt
    })

    // 清除旧消息并重新写入（简单可靠，消息量不大）
    this.db.run('DELETE FROM chat_messages WHERE session_id = $sid', { $sid: session.id })

    const stmt = this.db.prepare(`
      INSERT INTO chat_messages (id, session_id, role, content, thinking, created_at, error,
        input_tokens, output_tokens, reasoning_tokens, total_tokens)
      VALUES ($id, $session_id, $role, $content, $thinking, $created_at, $error,
        $input_tokens, $output_tokens, $reasoning_tokens, $total_tokens)
    `)
    for (const m of messages) {
      stmt.bind({
        $id: m.id,
        $session_id: m.sessionId,
        $role: m.role,
        $content: m.content,
        $thinking: m.thinkingContent || '',
        $created_at: m.createdAt,
        $error: m.error ? 1 : 0,
        $input_tokens: m.usage?.inputTokens ?? 0,
        $output_tokens: m.usage?.outputTokens ?? 0,
        $reasoning_tokens: m.usage?.reasoningTokens ?? 0,
        $total_tokens: m.usage?.totalTokens ?? 0,
      })
      stmt.step()
      stmt.reset()
    }
    stmt.free()
    this.save()
  }

  deleteChatSession(sessionId: string): void {
    this.db.run('DELETE FROM chat_messages WHERE session_id = $sid', { $sid: sessionId })
    this.db.run('DELETE FROM chat_sessions WHERE id = $sid', { $sid: sessionId })
    this.save()
  }

  close(): void {
    this.save()
    this.db.close()
  }
}
