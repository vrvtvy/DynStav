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
    this.save()
  }

  getBlocks(): BlockInfo[] {
    const stmt = this.db.prepare(
      'SELECT DISTINCT block_code, block_name FROM block_stats ORDER BY block_code'
    )
    const rows: BlockInfo[] = []
    while (stmt.step()) {
      const row = stmt.getAsObject() as any
      rows.push({ code: row.block_code, name: row.block_name })
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

  /** 将数据库保存到文件 */
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
