import { useState, useEffect, useCallback } from 'react'
import { ThemeType, QueryParams, BlockDailyStats, BlockInfo } from './types'
import { getTradingDateRange } from './utils'
import Layout from './components/Layout'
import MenuBar from './components/MenuBar'
import Sidebar from './components/Sidebar'
import ChartView from './components/Chart'
import RightPanel from './components/RightPanel'
import StatusBar from './components/StatusBar'
import Welcome from './components/Welcome'
import GuideContent from './components/GuideContent'
import RestoreDialog from './components/RestoreDialog'
import ConfirmDialog from './components/ConfirmDialog'
import styles from './App.module.css'
import log from 'electron-log/renderer'

export default function App() {
  // 初始 setup 状态同步读自 localStorage（preload 写入），第一帧即渲染 Layout，
  // 避免先返回 null 再异步切换导致区域逐个冒出的色块观感
  const [setupComplete, setSetupComplete] = useState<boolean>(
    () => localStorage.getItem('appSetupComplete') === '1'
  )
  // 初始主题读自 preload 已设置的 data-theme，避免 dark→真实主题的二次切换闪烁
  const [theme, setTheme] = useState<ThemeType>(
    () => (document.documentElement.getAttribute('data-theme') as ThemeType) || 'dark'
  )
  const [blocks, setBlocks] = useState<BlockInfo[]>([])
  const [selectedBlock, setSelectedBlock] = useState<string>('')
  const [queryParams, setQueryParams] = useState<QueryParams>({})
  const [stats, setStats] = useState<BlockDailyStats[]>([])
  const [latestDate, setLatestDate] = useState<string>('')
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [rightPanelWidth, setRightPanelWidth] = useState(0)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [marketWarningOpen, setMarketWarningOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    // 单次获取配置：theme 与是否首次运行（!thsUserDir）一并从 config 推导，省一次 IPC 与磁盘读
    window.electronAPI.getConfig().then((config) => {
      if (config.theme) setTheme(config.theme)
      setSetupComplete(!!config.thsUserDir)
    })
  }, [])

  useEffect(() => {
    const unsub = window.electronAPI.onConfigLoaded((t) => {
      setTheme(t as ThemeType)
    })
    return unsub
  }, [])

  const toggleTheme = useCallback(async () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      window.electronAPI.getConfig().then(config => {
        window.electronAPI.saveConfig({ ...config, theme: next })
      })
      return next
    })
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (setupComplete) {
      loadBlocks()
      loadLatestDate()
    }
  }, [setupComplete])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function loadBlocks() {
    const list = await window.electronAPI.getBlocks()
    setBlocks(list)
    if (list.length > 0 && !selectedBlock) {
      setSelectedBlock(list[0].code)
    }
  }

  async function loadLatestDate() {
    const date = await window.electronAPI.getLatestDate()
    if (date) setLatestDate(date)
  }

  async function handleSearch(params: QueryParams) {
    setQueryParams(params)
    const result = await window.electronAPI.queryStats(params)
    setStats(result)
  }

  async function handleSync() {
    // 盘中同步确认：A 股交易时段内获取的是实时价格而非收盘价
    const isMarketOpen = await window.electronAPI.checkMarketOpen()
    if (isMarketOpen) {
      setMarketWarningOpen(true)
      return
    }
    await doSync()
  }

  async function doSync() {
    setSyncing(true)
    await window.electronAPI.syncData()
    setSyncing(false)
    showToast('数据同步完成')
    await loadBlocks()
    await loadLatestDate()
    if (queryParams.blockCode) {
      handleSearch(queryParams)
    }
  }

  function handleBlockClick(blockCode: string) {
    setSelectedBlock(blockCode)
    handleSearch({ ...queryParams, blockCode })
  }

  function handleReset(blockCode: string) {
    const { startDate, endDate } = getTradingDateRange(7, latestDate)
    setSelectedBlock(blockCode)
    handleSearch({ startDate, endDate, blockCode })
  }

  async function handleUpdateSort(codes: string[]) {
    await window.electronAPI.updateBlockSort(codes)
    setBlocks(prev => {
      const order = new Map(codes.map((c, i) => [c, codes.length - i]))
      return [...prev].sort((a, b) => (order.get(b.code) ?? 0) - (order.get(a.code) ?? 0))
    })
  }

  async function handleSetupComplete() {
    const config = await window.electronAPI.getConfig()
    if (config.theme) setTheme(config.theme)
    setSetupComplete(true)
  }

  // 数据恢复完成后刷新界面：重新加载板块/最新日期，并按当前查询条件重新拉取统计
  async function handleRestoreDone() {
    setRestoreOpen(false)
    await loadBlocks()
    await loadLatestDate()
    if (queryParams.blockCode) {
      handleSearch(queryParams)
    }
    showToast('数据恢复完成')
  }

  if (!setupComplete) return <Welcome onComplete={handleSetupComplete} />

  return (
    <div className={styles.app}>
      <Layout
        theme={theme}
        sidebarWidth={sidebarWidth}
        rightPanelWidth={rightPanelWidth}
        onSidebarResize={setSidebarWidth}
        onRightPanelResize={setRightPanelWidth}
        menuBar={
          <MenuBar
            syncing={syncing}
            theme={theme}
            onSync={handleSync}
            onToggleTheme={toggleTheme}
            onRestore={() => setRestoreOpen(true)}
            onGuide={() => setGuideOpen(true)}
          />
        }
        sidebar={
          <Sidebar
            blocks={blocks}
            selectedBlock={selectedBlock}
            onSearch={handleSearch}
            onBlockClick={handleBlockClick}
            onReset={handleReset}
            onUpdateSort={handleUpdateSort}
            latestDate={latestDate}
          />
        }
        main={
          <ChartView
            stats={stats}
            selectedBlock={selectedBlock}
            blocks={blocks}
          />
        }
        rightPanel={<RightPanel />}
        statusBar={<StatusBar latestDate={latestDate} />}
      />
      {toast && <div className={styles.toast}>{toast}</div>}
      {restoreOpen && (
        <RestoreDialog
          open={restoreOpen}
          onClose={() => setRestoreOpen(false)}
          onRestored={handleRestoreDone}
        />
      )}
      <ConfirmDialog
        open={marketWarningOpen}
        title="盘中同步提示"
        message="当前处于 A 股盘中交易时段（9:15-15:00），同步获取的是实时价格而非收盘价，统计结果可能与最终收盘数据不一致。是否继续？"
        confirmText="继续同步"
        cancelText="取消"
        onConfirm={() => {
          setMarketWarningOpen(false)
          doSync()
        }}
        onCancel={() => setMarketWarningOpen(false)}
      />
      {guideOpen && (
        <div className={styles.guideOverlay} onClick={() => setGuideOpen(false)}>
          <div className={styles.guideDialog} onClick={e => e.stopPropagation()}>
            <div className={styles.guideDialogHeader}>
              <h2 className={styles.guideDialogTitle}>使用指南</h2>
              <button className={styles.guideCloseBtn} onClick={() => setGuideOpen(false)}>✕</button>
            </div>
            <GuideContent />
          </div>
        </div>
      )}
    </div>
  )
}
