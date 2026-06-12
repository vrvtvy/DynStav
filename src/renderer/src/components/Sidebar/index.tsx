import { useState, useEffect, useRef } from 'react'
import { BlockInfo, QueryParams } from '../../types'
import styles from './styles.module.css'

interface SidebarProps {
  blocks: BlockInfo[]
  selectedBlock: string
  onSearch: (params: QueryParams) => void
  onBlockClick: (blockCode: string) => void
  onReset: () => void
}

export default function Sidebar({
  blocks,
  selectedBlock,
  onSearch,
  onBlockClick,
  onReset
}: SidebarProps) {
  const [blockNameFilter, setBlockNameFilter] = useState('')
  const [dateRange, setDateRange] = useState('7')
  const searchRef = useRef<HTMLInputElement>(null)

  const filteredBlocks = blockNameFilter
    ? blocks.filter(b => b.name.includes(blockNameFilter))
    : blocks

  useEffect(() => {
    // 默认触发一次搜索
    if (blocks.length > 0) {
      handleSearch()
    }
  }, [blocks])

  function getDateRange(dateStr: string): { startDate: string; endDate: string } {
    const end = new Date()
    const endDate = end.toISOString().slice(0, 10)
    const start = new Date()
    start.setDate(start.getDate() - parseInt(dateStr))
    const startDate = start.toISOString().slice(0, 10)
    return { startDate, endDate }
  }

  function handleSearch() {
    const blockCode = blocks.find(b => b.name === blockNameFilter)?.code || blocks[0]?.code || ''
    const { startDate, endDate } = getDateRange(dateRange)
    onSearch({ startDate, endDate, blockCode })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch()
  }

  function handleReset() {
    setBlockNameFilter('')
    setDateRange('7')
    onReset()
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.filters}>
        <label className={styles.label}>
          日期区间
          <select
            className={styles.select}
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
          >
            <option value="3">最近3个交易日</option>
            <option value="7">最近7个交易日</option>
            <option value="15">最近15个交易日</option>
            <option value="30">最近30个交易日</option>
          </select>
        </label>

        <label className={styles.label}>
          板块名称
          <input
            ref={searchRef}
            className={styles.input}
            type="text"
            placeholder="输入板块名称搜索..."
            value={blockNameFilter}
            onChange={e => setBlockNameFilter(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </label>

        <div className={styles.btnGroup}>
          <button className={styles.searchBtn} onClick={handleSearch} title="搜索">
            🔍
          </button>
          <button className={styles.resetBtn} onClick={handleReset} title="重置">
            ↺
          </button>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.blockList}>
        <div className={styles.blockListTitle}>
          板块列表 ({filteredBlocks.length})
        </div>
        {filteredBlocks.map(block => (
          <div
            key={block.code}
            className={`${styles.blockItem} ${selectedBlock === block.code ? styles.blockItemActive : ''}`}
            onClick={() => onBlockClick(block.code)}
          >
            {block.name}
          </div>
        ))}
      </div>
    </div>
  )
}
