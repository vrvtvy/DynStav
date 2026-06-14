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
    </div>
  )
}
