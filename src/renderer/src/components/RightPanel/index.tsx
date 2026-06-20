import { useEffect, useState, useCallback } from 'react'
import { AiProviderConfig, BlockDailyStats } from '../../types'
import AiChat from './AiChat'
import AiConfigDialog from './AiConfigDialog'

interface RightPanelProps {
  blockName: string
  blockCode: string
  stats: BlockDailyStats[]
}

const LS_MODEL_KEY = 'dynstav_active_model_id'
const LS_PROVIDER_KEY = 'dynstav_active_provider_id'

/**
 * 右侧辅助栏：AI 对话分析容器。
 * 负责 AI 供应商配置的加载/保存与配置弹窗的显隐，
 * 真正的对话交互在 AiChat 组件中完成。
 */
export default function RightPanel({ blockName, blockCode, stats }: RightPanelProps) {
  const [providers, setProviders] = useState<AiProviderConfig[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeModelId, setActiveModelId] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // 启动加载已保存的 AI 配置
  useEffect(() => {
    window.electronAPI.aiListProviders().then((res) => {
      setProviders(res.providers)
      setActiveId(res.activeId)
      // 从 localStorage 恢复上次的模型选择
      const savedModelId = localStorage.getItem(LS_MODEL_KEY)
      const savedProviderId = localStorage.getItem(LS_PROVIDER_KEY)
      // 验证保存的 provider 和 model 是否还有效
      const provider = res.providers.find(p => p.id === (savedProviderId || res.activeId))
      if (provider && savedModelId) {
        const models = provider.models || []
        if (models.some(m => m.id === savedModelId)) {
          setActiveModelId(savedModelId)
        } else if (models.length > 0) {
          setActiveModelId(models[0].id)
        }
      } else if (provider && (provider.models || []).length > 0) {
        setActiveModelId(provider.models![0].id)
      }
      setLoaded(true)
    })
  }, [])

  const activeProvider =
    providers.find(p => p.id === activeId) || providers[0] || null

  function findFirstAvailableModel(providers: AiProviderConfig[]): { providerId: string; modelId: string } | null {
    for (const p of providers) {
      const validModels = (p.models || []).filter(m => m.model)
      if (validModels.length > 0) {
        return { providerId: p.id, modelId: validModels[0].id }
      }
    }
    return null
  }

  const handleSave = useCallback(
    async (next: AiProviderConfig[], nextActiveId: string | null) => {
      const res = await window.electronAPI.aiSaveProviders({
        providers: next,
        activeId: nextActiveId
      })
      setProviders(res.providers)

      const activeProvider = res.providers.find(p => p.id === res.activeId)
      const activeModels = activeProvider?.models || []
      const currentModelValid = activeModelId && activeModels.some(m => m.id === activeModelId)

      if (activeProvider && activeModels.length > 0 && currentModelValid) {
        setActiveId(res.activeId)
      } else {
        const firstAvailable = findFirstAvailableModel(res.providers)
        if (firstAvailable) {
          setActiveId(firstAvailable.providerId)
          setActiveModelId(firstAvailable.modelId)
          localStorage.setItem(LS_PROVIDER_KEY, firstAvailable.providerId)
          localStorage.setItem(LS_MODEL_KEY, firstAvailable.modelId)
          window.electronAPI.aiSaveProviders({
            providers: res.providers,
            activeId: firstAvailable.providerId
          })
        } else {
          setActiveId(res.activeId)
          setActiveModelId(null)
          localStorage.removeItem(LS_MODEL_KEY)
        }
      }
    },
    [activeModelId]
  )

  const handleTest = useCallback(
    (provider: AiProviderConfig) => window.electronAPI.aiTestProvider(provider),
    []
  )

  const handleModelChange = useCallback(
    (providerId: string, modelId: string) => {
      setActiveId(providerId)
      setActiveModelId(modelId)
      localStorage.setItem(LS_PROVIDER_KEY, providerId)
      localStorage.setItem(LS_MODEL_KEY, modelId)
      // 同步更新后端的 activeProvider
      window.electronAPI.aiSaveProviders({ providers, activeId: providerId })
    },
    [providers]
  )

  return (
    <>
      <AiChat
        blockName={blockName}
        blockCode={blockCode}
        stats={stats}
        providers={providers}
        activeProvider={activeProvider}
        activeModelId={activeModelId}
        onModelChange={handleModelChange}
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
