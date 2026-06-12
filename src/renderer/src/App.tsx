import { useState, useEffect, useCallback } from 'react'
import { ThemeType, QueryParams, BlockDailyStats, BlockInfo } from './types'
import Layout from './components/Layout'
import MenuBar from './components/MenuBar'
import Sidebar from './components/Sidebar'
import ChartView from './components/Chart'
import RightPanel from './components/RightPanel'
import StatusBar from './components/StatusBar'

export default function App() {
  const [theme, setTheme] = useState<ThemeType>('dark')
  const [blocks, setBlocks] = useState<BlockInfo[]>([])
  const [selectedBlock, setSelectedBlock] = useState<string>('')
  const [queryParams, setQueryParams] = useState<QueryParams>({})
  const [stats, setStats] = useState<BlockDailyStats[]>([])
  const [latestDate, setLatestDate] = useState<string>('')
  const [syncing, setSyncing] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [rightPanelWidth, setRightPanelWidth] = useState(0)

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    loadBlocks()
    loadLatestDate()
  }, [])

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

  return (
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
          onReset={() => setSelectedBlock('')}
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
  )
}
