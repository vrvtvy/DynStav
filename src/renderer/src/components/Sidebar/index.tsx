import { useState, useEffect, useRef } from 'react'
import { BlockInfo, QueryParams } from '../../types'
import { getTradingDateRange } from '../../utils'
import styles from './styles.module.css'

interface SidebarProps {
  blocks: BlockInfo[]
  selectedBlock: string
  onSearch: (params: QueryParams) => void
  onBlockClick: (blockCode: string) => void
  onReset: (blockCode: string) => void
  onUpdateSort?: (codes: string[]) => void
  latestDate: string
}

export default function Sidebar({
  blocks,
  selectedBlock,
  onSearch,
  onBlockClick,
  onReset,
  onUpdateSort,
  latestDate
}: SidebarProps) {
  const [blockNameFilter, setBlockNameFilter] = useState('')
  const [dateRange, setDateRange] = useState('7')
  const [localBlocks, setLocalBlocks] = useState<BlockInfo[]>(blocks)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (dragIdx === null) {
      setLocalBlocks(blocks)
    }
  }, [blocks, dragIdx])

  const filteredBlocks = blockNameFilter
    ? localBlocks.filter(b => b.name.includes(blockNameFilter))
    : localBlocks

  function doSearch(dateVal?: string) {
    const val = dateVal ?? dateRange
    const { startDate, endDate } = getTradingDateRange(parseInt(val), latestDate)
    onSearch({ startDate, endDate, blockCode: selectedBlock || blocks[0]?.code })
  }

  useEffect(() => {
    if (blocks.length > 0) {
      doSearch()
    }
  }, [blocks])

  function handleDateChange(val: string) {
    setDateRange(val)
    doSearch(val)
  }

  function handleFilterChange(val: string) {
    setBlockNameFilter(val)
    doSearch()
  }

  function handleClearFilter() {
    setBlockNameFilter('')
    searchRef.current?.focus()
    doSearch()
  }

  function handleReset() {
    setBlockNameFilter('')
    setDateRange('7')
    const first = blocks[0]?.code || ''
    onReset(first)
  }

  function handleDragStart(index: number) {
    setDragIdx(index)
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === index) return
    const reordered = [...localBlocks]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(index, 0, moved)
    setLocalBlocks(reordered)
    setDragIdx(index)
  }

  function handleDragEnd() {
    setDragIdx(null)
    const codes = localBlocks.map(b => b.code)
    onUpdateSort?.(codes)
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.filters}>
        <div className={styles.dateRow}>
          <select
            className={styles.select}
            value={dateRange}
            onChange={e => handleDateChange(e.target.value)}
          >
            <option value="3">最近3个交易日</option>
            <option value="7">最近7个交易日</option>
            <option value="15">最近15个交易日</option>
            <option value="30">最近30个交易日</option>
          </select>
          <button className={styles.resetBtn} onClick={handleReset} title="重置">
            ↺
          </button>
        </div>

        <div className={styles.searchRow}>
          <input
            ref={searchRef}
            className={styles.input}
            type="text"
            placeholder="搜索板块..."
            value={blockNameFilter}
            onChange={e => handleFilterChange(e.target.value)}
          />
          {blockNameFilter && (
            <button className={styles.clearBtn} onClick={handleClearFilter} title="清除搜索">
              ✕
            </button>
          )}
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.blockList}>
        <div className={styles.blockListTitle}>
          板块列表 ({filteredBlocks.length})
        </div>
        {filteredBlocks.map((block, idx) => (
          <div
            key={block.code}
            className={`${styles.blockItem} ${selectedBlock === block.code ? styles.blockItemActive : ''} ${dragIdx === idx ? styles.dragging : ''}`}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={e => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            onClick={() => onBlockClick(block.code)}
          >
            <span className={styles.blockItemName}>{block.name}</span>
            <span className={styles.blockItemMeta}>
              {block.stockCount != null && <span>{block.stockCount}只</span>}
              {block.avgChangePercent != null && (
                <span className={block.avgChangePercent >= 0 ? styles.up : styles.down}>
                  {block.avgChangePercent >= 0 ? '+' : ''}{block.avgChangePercent.toFixed(2)}%
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
