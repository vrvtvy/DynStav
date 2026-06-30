import { useEffect, useRef, useState } from 'react'
import {
  AiProviderConfig,
  AiProviderTemplate,
  AiModelConfig,
  ReasoningLevel
} from '../../types'
import styles from './AiConfigDialog.module.css'

interface AiConfigDialogProps {
  open: boolean
  providers: AiProviderConfig[]
  activeId: string | null
  onClose: () => void
  onSave: (providers: AiProviderConfig[], activeId: string | null) => Promise<void>
  onTest: (provider: AiProviderConfig) => Promise<{ ok: boolean; message: string }>
}

/** 模板预设：选定模板时自动填充默认 baseUrl / path，减少手填出错。 */
const TEMPLATE_PRESETS: Record<
  AiProviderTemplate,
  { label: string; baseUrl: string; path: string; model: string; hint: string }
> = {
  completion: {
    label: 'Chat Completions',
    baseUrl: '',
    path: '/chat/completions',
    model: '',
    hint: 'OpenAI 及其兼容网关（deepseek、moonshot、本地 vLLM/Ollama 等）'
  },
  responses: {
    label: 'Responses',
    baseUrl: '',
    path: '/responses',
    model: '',
    hint: 'OpenAI 最先进的模型响应接口。支持文本和图像输入，以及文本输出。'
  },
  anthropic: {
    label: 'Anthropic Messages',
    baseUrl: 'https://api.anthropic.com',
    path: '/v1/messages',
    model: '',
    hint: 'Anthropic Messages API'
  },
  custom: {
    label: '自定义',
    baseUrl: '',
    path: '/chat/completions',
    model: '',
    hint: '沿用 OpenAI 协议，可自行改 baseUrl/path/headers'
  }
}

/** 兼容旧版模板名，确保 TEMPLATE_PRESETS 查找不崩溃 */
function normalizeTemplate(tpl: string): AiProviderTemplate {
  if (tpl === 'openai') return 'completion'
  if (tpl === 'azure') return 'responses'
  if (tpl in TEMPLATE_PRESETS) return tpl as AiProviderTemplate
  return 'custom'
}

const DEFAULT_PROVIDER: Omit<AiProviderConfig, 'id'> = {
  name: '',
  template: 'completion',
  baseUrl: TEMPLATE_PRESETS.completion.baseUrl,
  model: TEMPLATE_PRESETS.completion.model,
  path: TEMPLATE_PRESETS.completion.path,
  apiKey: '',
  timeoutMs: 300000,
  temperature: 0.3,
  headers: {},
  models: []
}

function genId(): string {
  return `prov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function genModelId(): string {
  return `mdl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** 从模型名自动检测品牌图标 key（公开，AiChat 也复用） */
export function detectModelIconKey(model: string): string | undefined {
  const m = model.toLowerCase()
  if (m.includes('qwen')) return 'qwen'
  if (m.includes('deepseek')) return 'deepseek'
  if (m.includes('glm')) return 'zhipu'
  if (m.includes('gemini')) return 'google'
  if (m.includes('claude')) return 'anthropic'
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return 'openai'
  if (m.includes('grok')) return 'grok'
  if (m.includes('kimi') || m.includes('moonshot')) return 'moonshot'
  if (m.includes('minimax') || m.includes('abab')) return 'minimax'
  if (m.includes('mimo') || m.includes('xiaomi')) return 'xiaomimimo'
  if (m.includes('doubao')) return 'doubao'
  if (m.includes('hunyuan')) return 'hunyuan'
  return undefined
}

export default function AiConfigDialog({
  open,
  providers,
  activeId,
  onClose,
  onSave,
  onTest
}: AiConfigDialogProps) {
  const [list, setList] = useState<AiProviderConfig[]>(providers)
  const [active, setActive] = useState<string | null>(activeId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  /** 当前正在编辑的模型 id */
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  /** 每个模型的测试结果：modelId -> result */
  const [modelTestResults, setModelTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  /** 正在测试的模型 id */
  const [testingModelId, setTestingModelId] = useState<string | null>(null)
  /** 模型列表容器引用：添加模型后自动滚动到编辑区 */
  const modelListRef = useRef<HTMLDivElement>(null)
  /** 供应商列表容器引用：新增供应商后自动滚动到对应项 */
  const sidebarListRef = useRef<HTMLDivElement>(null)
  /** 获取模型列表中的状态 */
  const [fetchingModels, setFetchingModels] = useState(false)

  useEffect(() => {
    if (open) {
      // 向后兼容：为非预设的旧供应商自动创建一个模型（预设提供商保持空列表，由用户获取）
      const migrated = providers.map(p => {
        if (!p.isPreset && (!p.models || p.models.length === 0)) {
          return {
            ...p,
            models: [{
              id: genModelId(),
              model: p.model || '',
              name: '',
              temperature: p.temperature
            }]
          }
        }
        return p
      })
      setList(migrated)
      setActive(activeId)
      // 优先展示当前活跃供应商（即当前所选模型对应的供应商），无匹配时回退到第一个
      const target = activeId ? migrated.find(p => p.id === activeId) : null
      setEditingId(target?.id ?? migrated[0]?.id ?? null)
      setEditingModelId(null)
      setModelTestResults({})
      setError('')
    }
  }, [open, providers, activeId])

  // 展开/折叠模型编辑区时自动滚动到对应模型
  useEffect(() => {
    if (editingModelId && modelListRef.current) {
      // 双重 rAF：等待展开内容完成渲染和布局
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = modelListRef.current?.querySelector(`[data-model-id="${editingModelId}"]`) as HTMLElement | null
          if (!el) return
          // 找到滚动容器（.formArea）
          let container: HTMLElement | null = modelListRef.current
          while (container && container !== document.body) {
            const ov = getComputedStyle(container).overflowY
            if (ov === 'auto' || ov === 'scroll') break
            container = container.parentElement
          }
          if (!container || container === document.body) return
          // 将展开条目定位到滚动容器顶部附近，留出空间显示底部蓝色边线
          const elRect = el.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()
          const delta = elRect.top - containerRect.top - 10
          container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' })
        })
      })
    }
  }, [editingModelId])

  if (!open) return null

  const editing = list.find(p => p.id === editingId) || null
  const editingModels = editing?.models || []
  const editingModel = editingModels.find(m => m.id === editingModelId) || null

  function update(field: keyof AiProviderConfig, value: any) {
    if (!editing) return
    setList(prev => prev.map(p => (p.id === editing.id ? { ...p, [field]: value } : p)))
  }

  function applyTemplate(tpl: AiProviderTemplate) {
    if (!editing) return
    const preset = TEMPLATE_PRESETS[tpl]
    setList(prev =>
      prev.map(p =>
        p.id === editing.id
          ? { ...p, template: tpl, baseUrl: preset.baseUrl, path: preset.path }
          : p
      )
    )
  }

  function handleAdd() {
    const item: AiProviderConfig = { ...DEFAULT_PROVIDER, id: genId(), name: `供应商 ${list.length + 1}`, models: [] }
    setList(prev => [...prev, item])
    setEditingId(item.id)
    setActive(item.id)
    setEditingModelId(null)
    // 新增后自动滚动到该供应商
    requestAnimationFrame(() => {
      const el = sidebarListRef.current?.querySelector(`[data-provider-id="${item.id}"]`) as HTMLElement | null
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  function handleDelete(id: string) {
    const nextList = list.filter(p => p.id !== id)
    setList(nextList)
    if (active === id) setActive(null)
    if (editingId === id) {
      setEditingId(nextList[0]?.id ?? null)
      setEditingModelId(null)
    }
  }

  // ─── 获取模型列表 ───

  async function handleFetchModels() {
    if (!editing || !editing.apiKey.trim()) return
    setFetchingModels(true)
    setError('')
    try {
      const modelIds = await window.electronAPI.aiFetchModels(editing)
      if (modelIds.length === 0) {
        setError('未获取到任何模型')
        return
      }
      // 将获取到的模型添加到列表中（跳过已存在的）
      const existingModels = new Set((editing.models || []).map(m => m.model))
      const newModels: AiModelConfig[] = modelIds
        .filter(id => !existingModels.has(id))
        .map(id => ({
          id: genModelId(),
          model: id,
          name: '',
          iconKey: detectModelIconKey(id),
        }))
      if (newModels.length === 0) {
        setError('所有模型已存在，无需重复添加')
        return
      }
      const models = [...(editing.models || []), ...newModels]
      setList(prev => prev.map(p => (p.id === editing.id ? { ...p, models } : p)))
    } catch (e: any) {
      setError(`获取模型列表失败：${e?.message || '未知错误'}`)
    } finally {
      setFetchingModels(false)
    }
  }

  // ─── 模型管理 ───

  function handleAddModel() {
    if (!editing) return
    const newModel: AiModelConfig = {
      id: genModelId(),
      model: '',
      name: '',
      iconKey: undefined,
    }
    const models = [...(editing.models || []), newModel]
    setList(prev => prev.map(p => (p.id === editing.id ? { ...p, models } : p)))
    setEditingModelId(newModel.id)
  }

  function handleDeleteModel(modelId: string) {
    if (!editing) return
    const models = (editing.models || []).filter(m => m.id !== modelId)
    setList(prev => prev.map(p => (p.id === editing.id ? { ...p, models } : p)))
    if (editingModelId === modelId) setEditingModelId(null)
  }

  function updateModel(modelId: string, field: keyof AiModelConfig, value: any) {
    if (!editing) return
    const models = (editing.models || []).map(m =>
      m.id === modelId ? { ...m, [field]: value } : m
    )
    setList(prev => prev.map(p => (p.id === editing.id ? { ...p, models } : p)))
  }

  // ─── 自定义参数管理 ───

  function addCustomParam(modelId: string) {
    if (!editing) return
    const model = editingModels.find(m => m.id === modelId)
    if (!model) return
    const params = { ...(model.customParams || {}), '': '' }
    updateModel(modelId, 'customParams', params)
  }

  function updateCustomParamKey(modelId: string, oldKey: string, newKey: string) {
    if (!editing) return
    const model = editingModels.find(m => m.id === modelId)
    if (!model) return
    const oldParams = model.customParams || {}
    const newParams: Record<string, string> = {}
    for (const [k, v] of Object.entries(oldParams)) {
      if (k === oldKey) {
        newParams[newKey] = v
      } else {
        newParams[k] = v
      }
    }
    updateModel(modelId, 'customParams', newParams)
  }

  function updateCustomParamValue(modelId: string, key: string, value: string) {
    if (!editing) return
    const model = editingModels.find(m => m.id === modelId)
    if (!model) return
    const params = { ...(model.customParams || {}), [key]: value }
    updateModel(modelId, 'customParams', params)
  }

  function removeCustomParam(modelId: string, key: string) {
    if (!editing) return
    const model = editingModels.find(m => m.id === modelId)
    if (!model) return
    const params = { ...(model.customParams || {}) }
    delete params[key]
    updateModel(modelId, 'customParams', params)
  }

  // ─── 测试连接（每个模型单独测试） ───

  async function handleTestModel(model: AiModelConfig) {
    if (!editing) return
    const testProvider: AiProviderConfig = {
      ...editing,
      model: model.model,
      temperature: model.temperature ?? editing.temperature,
      customParams: { ...editing.customParams, ...model.customParams },
      maxOutputTokens: model.maxOutputTokens ?? editing.maxOutputTokens,
      contextWindow: model.contextWindow ?? editing.contextWindow,
      reasoning: model.reasoning,
    }
    setTestingModelId(model.id)
    setModelTestResults(prev => {
      const next = { ...prev }
      delete next[model.id]
      return next
    })
    try {
      const res = await onTest(testProvider)
      setModelTestResults(prev => ({ ...prev, [model.id]: res }))
    } catch (e: any) {
      setModelTestResults(prev => ({ ...prev, [model.id]: { ok: false, message: e?.message || '测试失败' } }))
    } finally {
      setTestingModelId(null)
    }
  }

  async function handleSave() {
    setError('')
    for (const p of list) {
      if (!p.name.trim()) { setError(`供应商「${p.name || '(未命名)'}」名称不能为空`); return }
      // 预设提供商允许不填 API Key（用户可稍后配置），仅校验自定义提供商
      if (!p.isPreset) {
        if (!p.baseUrl.trim()) { setError(`供应商「${p.name}」的 API 地址不能为空`); return }
        if (!p.apiKey.trim()) { setError(`供应商「${p.name}」的 API 密钥不能为空`); return }
        if (!p.models || p.models.length === 0) {
          setError(`供应商「${p.name}」至少需要一个模型`); return
        }
        for (const m of p.models) {
          if (!m.model.trim()) { setError(`供应商「${p.name}」中有模型的 API 名称为空`); return }
        }
      }
    }
    setSaving(true)
    try {
      await onSave(list, active)
      onClose()
    } catch (e: any) {
      setError(e?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const preset = editing ? TEMPLATE_PRESETS[normalizeTemplate(editing.template)] : null
  const presetList = list.filter(p => p.isPreset)
  const customList = list.filter(p => !p.isPreset)

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>AI 模型配置</h2>
          <button className={styles.closeBtn} onClick={onClose} title="关闭">&#x2715;</button>
        </div>

        <div className={styles.body}>
          {/* 左侧供应商列表 */}
          <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <span className={styles.sidebarTitle}>供应商</span>
              <button className={styles.addBtn} onClick={handleAdd} title="新增供应商">+ 新增</button>
            </div>
            <div className={styles.providerList} ref={sidebarListRef}>
              {list.length === 0 && (
                <div className={styles.emptyHint}>暂无配置，点击「新增」添加</div>
              )}

              {/* ── 预设提供商 ── */}
              {presetList.length > 0 && (
                <div className={styles.sidebarSectionTitle}>预设服务</div>
              )}
              {presetList.map(p => (
                <div
                  key={p.id}
                  data-provider-id={p.id}
                  className={`${styles.providerItem} ${editingId === p.id ? styles.providerItemActive : ''}`}
                  onClick={() => { setEditingId(p.id); setEditingModelId(null) }}
                >
                  <span className={styles.providerRadio}>
                    <input
                      type="radio"
                      checked={active === p.id}
                      onChange={() => setActive(p.id)}
                      onClick={e => e.stopPropagation()}
                      title="设为当前使用"
                    />
                  </span>
                  <div className={styles.providerInfo}>
                    <div className={styles.providerName}>
                      {p.name}
                      <span className={styles.presetBadge}>预设</span>
                    </div>
                    <div className={styles.providerSub}>
                      {TEMPLATE_PRESETS[normalizeTemplate(p.template)].label} · {(p.models || []).length} 个模型
                    </div>
                  </div>
                </div>
              ))}

              {/* ── 自定义提供商 ── */}
              {customList.length > 0 && (
                <div className={styles.sidebarSectionTitle}>自定义</div>
              )}
              {customList.map(p => (
                <div
                  key={p.id}
                  data-provider-id={p.id}
                  className={`${styles.providerItem} ${editingId === p.id ? styles.providerItemActive : ''}`}
                  onClick={() => { setEditingId(p.id); setEditingModelId(null) }}
                >
                  <span className={styles.providerRadio}>
                    <input
                      type="radio"
                      checked={active === p.id}
                      onChange={() => setActive(p.id)}
                      onClick={e => e.stopPropagation()}
                      title="设为当前使用"
                    />
                  </span>
                  <div className={styles.providerInfo}>
                    <div className={styles.providerName}>{p.name}</div>
                    <div className={styles.providerSub}>
                      {TEMPLATE_PRESETS[normalizeTemplate(p.template)].label} · {(p.models || []).length} 个模型
                    </div>
                  </div>
                  <button
                    className={styles.delBtn}
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }}
                    title="删除"
                  >&#x1f5d1;</button>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧编辑表单 */}
          <div className={styles.formArea}>
            {editing ? (
              <>
                {/* ─── 供应商基本信息 ─── */}
                <div className={styles.sectionTitle}>供应商信息</div>

                {editing.isPreset && !editing.apiKey && (
                  <div className={styles.presetHint}>
                    此为预设服务商，填入您的 API Key 后可点击「获取模型列表」自动添加可用模型。
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.label}>名称</label>
                  <div className={styles.inputWithClear}>
                    <input
                      className={styles.input}
                      value={editing.name}
                      onChange={e => update('name', e.target.value)}
                      placeholder="例如：我的 OpenAI"
                    />
                    {editing.name && <button className={styles.clearBtn} onClick={() => update('name', '')} title="清空">&#x2715;</button>}
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>接口类型（模板）</label>
                    <select
                      className={styles.select}
                      value={editing.template}
                      onChange={e => applyTemplate(e.target.value as AiProviderTemplate)}
                    >
                      {(Object.keys(TEMPLATE_PRESETS) as AiProviderTemplate[]).map(k => (
                        <option key={k} value={k}>{TEMPLATE_PRESETS[k].label}</option>
                      ))}
                    </select>
                    {preset && <div className={styles.hint}>{preset.hint}</div>}
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>请求路径（可选）</label>
                    <div className={styles.inputWithClear}>
                      <input
                        className={styles.input}
                        value={editing.path || ''}
                        onChange={e => update('path', e.target.value)}
                        placeholder="/chat/completions"
                      />
                      {editing.path && <button className={styles.clearBtn} onClick={() => update('path', '')} title="清空">&#x2715;</button>}
                    </div>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>API 地址（Base URL）</label>
                  <div className={styles.inputWithClear}>
                    <input
                      className={styles.input}
                      value={editing.baseUrl}
                      onChange={e => update('baseUrl', e.target.value)}
                      placeholder="https://api.example.com/v1"
                    />
                    {editing.baseUrl && <button className={styles.clearBtn} onClick={() => update('baseUrl', '')} title="清空">&#x2715;</button>}
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>API 密钥</label>
                  <div className={styles.inputWithClear}>
                    <input
                      className={styles.input}
                      type="password"
                      value={editing.apiKey}
                      onChange={e => update('apiKey', e.target.value)}
                      placeholder="sk-..."
                      autoComplete="off"
                    />
                    {editing.apiKey && <button className={styles.clearBtn} onClick={() => update('apiKey', '')} title="清空">&#x2715;</button>}
                  </div>
                  <div className={styles.hint}>密钥经系统级 DPAPI 加密后存储于本地配置目录。</div>
                </div>

                {/* ─── 模型列表 ─── */}
                <div className={styles.sectionTitle}>
                  模型列表
                  <div className={styles.modelListActions}>
                    {editing.isPreset && (
                      <button
                        className={styles.fetchModelsBtn}
                        onClick={handleFetchModels}
                        disabled={fetchingModels || !editing.apiKey.trim()}
                        title={!editing.apiKey.trim() ? '请先填写 API Key' : '从服务商 API 获取可用模型列表'}
                      >
                        {fetchingModels ? '获取中...' : '获取模型列表'}
                      </button>
                    )}
                    <button className={styles.addModelBtn} onClick={handleAddModel}>+ 添加模型</button>
                  </div>
                </div>

                <div className={styles.modelList} ref={modelListRef}>
                  {editingModels.length === 0 && (
                    <div className={styles.emptyHint}>暂无模型，点击「添加模型」</div>
                  )}
                  {editingModels.map(m => {
                    const testResult = modelTestResults[m.id]
                    const isTesting = testingModelId === m.id
                    const paramEntries = m.customParams ? Object.entries(m.customParams) : []
                    return (
                      <div
                        key={m.id}
                        data-model-id={m.id}
                        className={`${styles.modelItem} ${editingModelId === m.id ? styles.modelItemActive : ''}`}
                        onClick={() => setEditingModelId(editingModelId === m.id ? null : m.id)}
                      >
                        <div className={styles.modelItemHeader}>
                          <span className={styles.modelItemName}>{m.name || m.model || '(未命名)'}</span>
                          <span className={styles.modelItemSub}>{m.model}</span>
                          {testResult && (
                            <span className={`${styles.modelTestBadge} ${testResult.ok ? styles.testOk : styles.testFail}`}>
                              {testResult.ok ? '✓' : '✗'}
                            </span>
                          )}
                          <button
                            className={styles.modelDelBtn}
                            onClick={(e) => { e.stopPropagation(); handleDeleteModel(m.id) }}
                            title="删除模型"
                          >&#x2715;</button>
                        </div>
                        {editingModelId === m.id && (
                          <div className={styles.modelEditForm} onClick={e => e.stopPropagation()}>
                            <div className={styles.formRow}>
                              <div className={styles.formGroup}>
                                <label className={styles.label}>显示名称（可选）</label>
                                <input
                                  className={styles.input}
                                  value={m.name || ''}
                                  onChange={e => updateModel(m.id, 'name', e.target.value)}
                                  placeholder="留空则使用 API 名称"
                                />
                              </div>
                              <div className={styles.formGroup}>
                                <label className={styles.label}>API 模型名称</label>
                                <input
                                  className={styles.input}
                                  value={m.model}
                                  onChange={e => updateModel(m.id, 'model', e.target.value)}
                                  placeholder="API 模型名称"
                                />
                              </div>
                            </div>

                            {/* ─── 高级参数（可选项，留空使用模型默认） ─── */}
                            <div className={styles.formRow}>
                              <div className={styles.formGroup}>
                                <label className={styles.label}>
                                  最大输出 Token
                                  <span className={styles.helpIcon} title="模型单次回复的最大 token 数。留空则使用模型官方默认值，无需手动设置。仅当需要限制输出长度时填写。">?</span>
                                </label>
                                <input
                                  className={styles.input}
                                  type="number"
                                  min={1}
                                  value={m.maxOutputTokens ?? ''}
                                  onChange={e => updateModel(m.id, 'maxOutputTokens', e.target.value ? Number(e.target.value) : undefined)}
                                  placeholder="留空=模型默认"
                                  style={{ width: 150 }}
                                />
                                <div className={styles.hint}>不填则使用模型官方默认值，无需手动设置</div>
                              </div>
                              <div className={styles.formGroup}>
                                <label className={styles.label}>
                                  上下文窗口
                                  <span className={styles.helpIcon} title="模型可处理的最大上下文长度（token）。留空则系统自动学习该模型的窗口大小。已知可手动填写，如 1048576 表示 1M。">?</span>
                                </label>
                                <input
                                  className={styles.input}
                                  type="number"
                                  min={1024}
                                  value={m.contextWindow ?? ''}
                                  onChange={e => updateModel(m.id, 'contextWindow', e.target.value ? Number(e.target.value) : undefined)}
                                  placeholder="留空=自动学习"
                                  style={{ width: 150 }}
                                />
                                <div className={styles.hint}>不填则系统自动学习；如 1048576 = 1M</div>
                              </div>
                              <div className={styles.formGroup}>
                                <label className={styles.label}>
                                  推理强度
                                  <span className={styles.helpIcon} title="仅对支持推理的模型（DeepSeek R1 / Claude thinking / o1 等）生效。留空则使用模型默认行为。">?</span>
                                </label>
                                <select
                                  className={styles.select}
                                  value={m.reasoning || 'provider-default'}
                                  onChange={e => updateModel(m.id, 'reasoning', e.target.value === 'provider-default' ? undefined : e.target.value as ReasoningLevel)}
                                >
                                  <option value="provider-default">默认</option>
                                  <option value="low">低</option>
                                  <option value="medium">中</option>
                                  <option value="high">高</option>
                                  <option value="xhigh">极高</option>
                                  <option value="max">最大</option>
                                </select>
                                <div className={styles.hint}>仅对推理模型生效</div>
                              </div>
                            </div>

                            {/* ─── 自定义参数 ─── */}
                            <div className={styles.paramSection}>
                              <div className={styles.paramHeader}>
                                <label className={styles.label}>
                                  自定义参数
                                  <span className={styles.helpIcon} title="按模型方文档添加额外的请求体参数，如 reasoning_effort、top_p 等。参数将映射到 providerOptions 传递给模型 API，值会自动解析为数字/布尔/JSON。">?</span>
                                </label>
                                <button className={styles.addParamBtn} onClick={() => addCustomParam(m.id)}>+ 添加</button>
                              </div>
                              {paramEntries.map(([key, val]) => (
                                <div key={key} className={styles.paramRow}>
                                  <input
                                    className={styles.paramKey}
                                    value={key}
                                    onChange={e => updateCustomParamKey(m.id, key, e.target.value)}
                                    placeholder="参数名"
                                  />
                                  <input
                                    className={styles.paramValue}
                                    value={val}
                                    onChange={e => updateCustomParamValue(m.id, key, e.target.value)}
                                    placeholder="参数值"
                                  />
                                  <button
                                    className={styles.paramDelBtn}
                                    onClick={() => removeCustomParam(m.id, key)}
                                    title="删除"
                                  >&#x2715;</button>
                                </div>
                              ))}
                            </div>

                            {/* ─── 模型级测试连接 ─── */}
                            <div className={styles.modelTestRow}>
                              <button
                                className={styles.testBtn}
                                onClick={() => handleTestModel(m)}
                                disabled={isTesting}
                              >
                                {isTesting ? '测试中...' : '测试连接'}
                              </button>
                              {testResult && (
                                <span className={`${styles.testResult} ${testResult.ok ? styles.testOk : styles.testFail}`}>
                                  {testResult.ok ? '✓ ' : '✗ '}{testResult.message}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className={styles.formEmpty}>
                <p>从左侧选择或新增一个供应商进行配置</p>
              </div>
            )}
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>取消</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
