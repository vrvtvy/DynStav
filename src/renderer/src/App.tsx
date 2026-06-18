import { useState, useEffect, useCallback } from 'react'
import { ThemeType, FontSizeLevel, QueryParams, BlockDailyStats, BlockInfo } from './types'
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

const FONT_SIZE_CYCLE: FontSizeLevel[] = ['small', 'medium', 'large']

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
  const [fontSize, setFontSize] = useState<FontSizeLevel>(
    () => (localStorage.getItem('appFontSize') as FontSizeLevel) || 'medium'
  )
  const [blocks, setBlocks] = useState<BlockInfo[]>([])
  const [selectedBlock, setSelectedBlock] = useState<string>('')
  const [queryParams, setQueryParams] = useState<QueryParams>({})
  const [stats, setStats] = useState<BlockDailyStats[]>([])
  const [latestDate, setLatestDate] = useState<string>('')
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [rightPanelWidth, setRightPanelWidth] = useState(
    () => {
      const v = localStorage.getItem('rightPanelWidth')
      return v !== null ? Number(v) : 340
    }
  )
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [marketWarningOpen, setMarketWarningOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    // 单次获取配置：theme 与是否首次运行（!thsUserDir）一并从 config 推导，省一次 IPC 与磁盘读
    window.electronAPI.getConfig().then((config) => {
      if (config.theme) setTheme(config.theme)
      if (config.fontSize) setFontSize(config.fontSize)
      if (config.rightPanelWidth !== undefined) setRightPanelWidth(config.rightPanelWidth)
      setSetupComplete(!!config.thsUserDir)
      // 通知主进程渲染器已就绪（React 已挂载、onSyncDone 等监听器已注册），
      // 主进程收到后才启动自动同步，避免 sync-done 事件在监听器注册前发出被丢弃
      window.electronAPI.notifyRendererReady()
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

  // 字体大小：应用到 DOM 并持久化
  useEffect(() => {
    const root = document.documentElement
    if (fontSize === 'medium') {
      root.removeAttribute('data-font-size')
    } else {
      root.setAttribute('data-font-size', fontSize)
    }
    localStorage.setItem('appFontSize', fontSize)
  }, [fontSize])

  // 右侧面板宽度：持久化到配置文件与 localStorage
  useEffect(() => {
    localStorage.setItem('rightPanelWidth', String(rightPanelWidth))
    window.electronAPI.getConfig().then(config => {
      window.electronAPI.saveConfig({ ...config, rightPanelWidth })
    })
  }, [rightPanelWidth])

  const cycleFontSize = useCallback(() => {
    setFontSize(prev => {
      const idx = FONT_SIZE_CYCLE.indexOf(prev)
      const next = FONT_SIZE_CYCLE[(idx + 1) % FONT_SIZE_CYCLE.length]
      window.electronAPI.getConfig().then(config => {
        window.electronAPI.saveConfig({ ...config, fontSize: next })
      })
      return next
    })
  }, [])

  const toggleRightPanel = useCallback(() => {
    setRightPanelWidth(prev => {
      if (prev > 0) {
        // 记住展开时的宽度（同时写 localStorage 与配置文件）
        localStorage.setItem('rightPanelWidth', String(prev))
        window.electronAPI.getConfig().then(config => {
          window.electronAPI.saveConfig({ ...config, rightPanelWidth: 0 })
        })
        return 0
      }
      // 恢复：优先 localStorage（已有 '0' 以外的值），否则默认 340
      const saved = localStorage.getItem('rightPanelWidth')
      return (saved !== null && Number(saved) > 0) ? Number(saved) : 340
    })
  }, [])

  useEffect(() => {
    if (setupComplete) {
      loadBlocks()
      loadLatestDate()
    }
  }, [setupComplete])

  // 监听主进程的数据同步完成通知（启动自动同步 / 手动同步均会触发）
  // 确保数据库更新后渲染器内存中的板块列表、最新日期和查询结果及时刷新
  useEffect(() => {
    if (!setupComplete) return
    const unsub = window.electronAPI.onSyncDone(async () => {
      await loadBlocks()
      await loadLatestDate()
      // 有当前查询参数则用新数据重查，否则用默认7日参数发起首次查询
      if (queryParams.blockCode) {
        handleSearch(queryParams)
      } else {
        const [freshBlocks, freshDate] = await Promise.all([
          window.electronAPI.getBlocks(),
          window.electronAPI.getLatestDate()
        ])
        if (freshBlocks.length > 0 && freshDate) {
          const code = freshBlocks[0].code
          const { startDate, endDate } = getTradingDateRange(7, freshDate)
          handleSearch({ startDate, endDate, blockCode: code })
        }
      }
    })
    return unsub
  }, [setupComplete, queryParams])

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
    // 数据刷新由 onSyncDone 事件监听器统一处理
  }

  function handleBlockClick(blockCode: string) {
    setSelectedBlock(blockCode)
    handleSearch({ ...queryParams, blockCode })
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
            fontSize={fontSize}
            rightPanelVisible={rightPanelWidth > 0}
            onSync={handleSync}
            onToggleTheme={toggleTheme}
            onRestore={() => setRestoreOpen(true)}
            onGuide={() => setGuideOpen(true)}
            onChangeFontSize={cycleFontSize}
            onToggleRightPanel={toggleRightPanel}
          />
        }
        sidebar={
          <Sidebar
            blocks={blocks}
            selectedBlock={selectedBlock}
            onSearch={handleSearch}
            onBlockClick={handleBlockClick}
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
        rightPanel={
          <RightPanel
            blockName={blocks.find(b => b.code === selectedBlock)?.name || selectedBlock}
            blockCode={selectedBlock}
            stats={stats}
          />
        }
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
