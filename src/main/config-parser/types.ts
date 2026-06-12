/** 板块映射：变量名 -> 板块名称 */
export interface BlockNameMap {
  [variableName: string]: string
}

/** 板块股票内容：变量名 -> 股票代码列表 */
export interface BlockStockMap {
  [variableName: string]: string[]
}

/** 解析后的配置文件数据 */
export interface ParsedConfig {
  /** 板块名称映射 */
  blockNames: BlockNameMap
  /** 板块包含的股票代码（已过滤非A股） */
  blockStocks: BlockStockMap
  /** 全部A股代码列表（去重） */
  allAStockCodes: string[]
}
