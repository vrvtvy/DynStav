import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { getDataPath } from '../paths'
import { BlockDailyStats, BlockInfo, QueryParams } from '../../renderer/src/types'
import { DataRepository } from './interface'

let SQL: SqlJsStatic

export class SqliteRepository implements DataRepository {
  private db!: SqlJsDatabase
  private dbPath: string

  constructor() {
    this.dbPath = getDataPath('dynstav.db')
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
    } catch {}
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
    writeFileSync(this.dbPath, buffer)
  }

  close(): void {
    this.save()
    this.db.close()
  }
}
