import { useEffect, useState, useCallback } from 'react'
import { AiProviderConfig, BlockDailyStats } from '../../types'
import AiChat from './AiChat'
import AiConfigDialog from './AiConfigDialog'

interface RightPanelProps {
  blockName: string
  blockCode: string
  stats: BlockDailyStats[]
}

/**
 * 右侧辅助栏：AI 对话分析容器。
 * 负责 AI 供应商配置的加载/保存与配置弹窗的显隐，
 * 真正的对话交互在 AiChat 组件中完成。
 */
export default function RightPanel({ blockName, blockCode, stats }: RightPanelProps) {
  const [providers, setProviders] = useState<AiProviderConfig[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // 启动加载已保存的 AI 配置
  useEffect(() => {
    window.electronAPI.aiListProviders().then((res) => {
      setProviders(res.providers)
      setActiveId(res.activeId)
      setLoaded(true)
      // 不主动弹窗打扰用户：未配置时由对话区的占位提示与「⚙️ 配置」按钮引导
    })
  }, [])

  const activeProvider =
    providers.find(p => p.id === activeId) || providers[0] || null

  const handleSave = useCallback(
    async (next: AiProviderConfig[], nextActiveId: string | null) => {
      const res = await window.electronAPI.aiSaveProviders({
        providers: next,
        activeId: nextActiveId
      })
      setProviders(res.providers)
      setActiveId(res.activeId)
    },
    []
  )

  const handleTest = useCallback(
    (provider: AiProviderConfig) => window.electronAPI.aiTestProvider(provider),
    []
  )

  return (
    <>
      <AiChat
        blockName={blockName}
        blockCode={blockCode}
        stats={stats}
        providers={providers}
        activeProvider={activeProvider}
        onOpenConfig={() => setConfigOpen(true)}
      />
      <AiConfigDialog
        open={configOpen}
        providers={providers}
        activeId={activeId}
        onClose={() => setConfigOpen(false)}
        onSave={handleSave}
        onTest={handleTest}
      />
    </>
  )
}
