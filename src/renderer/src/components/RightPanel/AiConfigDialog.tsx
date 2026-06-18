import { useEffect, useState } from 'react'
import {
  AiProviderConfig,
  AiProviderTemplate
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
  openai: {
    label: 'OpenAI 兼容',
    baseUrl: 'https://api.openai.com/v1',
    path: '/chat/completions',
    model: 'gpt-4o-mini',
    hint: 'OpenAI 及其兼容网关（deepseek、moonshot、本地 vLLM/Ollama 等）'
  },
  azure: {
    label: 'Azure OpenAI',
    baseUrl: '',
    path: '',
    model: 'deployment-name',
    hint: 'baseUrl 填 endpoint，model 填部署名（自动拼接 /openai/deployments/{model}/chat/completions）'
  },
  anthropic: {
    label: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com',
    path: '/v1/messages',
    model: 'claude-3-5-sonnet-latest',
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

const DEFAULT_PROVIDER: Omit<AiProviderConfig, 'id'> = {
  name: '',
  template: 'openai',
  baseUrl: TEMPLATE_PRESETS.openai.baseUrl,
  model: TEMPLATE_PRESETS.openai.model,
  path: TEMPLATE_PRESETS.openai.path,
  apiKey: '',
  timeoutMs: 15000,
  temperature: 0.3,
  headers: {}
}

function genId(): string {
  return `prov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
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
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setList(providers)
      setActive(activeId)
      setEditingId(providers[0]?.id ?? null)
      setTestResult(null)
      setError('')
    }
  }, [open, providers, activeId])

  if (!open) return null

  const editing = list.find(p => p.id === editingId) || null

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
          ? { ...p, template: tpl, baseUrl: preset.baseUrl, path: preset.path, model: preset.model }
          : p
      )
    )
  }

  function handleAdd() {
    const item: AiProviderConfig = { ...DEFAULT_PROVIDER, id: genId(), name: `供应商 ${list.length + 1}` }
    setList(prev => [...prev, item])
    setEditingId(item.id)
    setActive(item.id)
    setTestResult(null)
  }

  function handleDelete(id: string) {
    setList(prev => prev.filter(p => p.id !== id))
    if (active === id) setActive(null)
    if (editingId === id) setEditingId(null)
  }

  async function handleSave() {
    setError('')
    // 基本校验
    for (const p of list) {
      if (!p.name.trim()) { setError(`供应商「${p.name || '(未命名)'}」名称不能为空`); return }
      if (!p.baseUrl.trim()) { setError(`供应商「${p.name}」的 API 地址不能为空`); return }
      if (!p.model.trim()) { setError(`供应商「${p.name}」的模型名不能为空`); return }
      if (!p.apiKey.trim()) { setError(`供应商「${p.name}」的 API 密钥不能为空`); return }
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

  async function handleTest() {
    if (!editing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await onTest(editing)
      setTestResult(res)
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message || '测试失败' })
    } finally {
      setTesting(false)
    }
  }

  const preset = editing ? TEMPLATE_PRESETS[editing.template] : null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>⚙️ AI 模型配置</h2>
          <button className={styles.closeBtn} onClick={onClose} title="关闭">✕</button>
        </div>

        <div className={styles.body}>
          {/* 左侧供应商列表 */}
          <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <span className={styles.sidebarTitle}>供应商</span>
              <button className={styles.addBtn} onClick={handleAdd} title="新增供应商">+ 新增</button>
            </div>
            <div className={styles.providerList}>
              {list.length === 0 && (
                <div className={styles.emptyHint}>暂无配置，点击「新增」添加</div>
              )}
              {list.map(p => (
                <div
                  key={p.id}
                  className={`${styles.providerItem} ${editingId === p.id ? styles.providerItemActive : ''}`}
                  onClick={() => { setEditingId(p.id); setTestResult(null) }}
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
                    <div className={styles.providerSub}>{TEMPLATE_PRESETS[p.template].label} · {p.model || '-'}</div>
                  </div>
                  <button
                    className={styles.delBtn}
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }}
                    title="删除"
                  >🗑</button>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧编辑表单 */}
          <div className={styles.formArea}>
            {editing ? (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.label}>名称</label>
                  <input
                    className={styles.input}
                    value={editing.name}
                    onChange={e => update('name', e.target.value)}
                    placeholder="例如：我的 OpenAI"
                  />
                </div>

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
                  <label className={styles.label}>API 地址（Base URL）</label>
                  <input
                    className={styles.input}
                    value={editing.baseUrl}
                    onChange={e => update('baseUrl', e.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>模型名称</label>
                    <input
                      className={styles.input}
                      value={editing.model}
                      onChange={e => update('model', e.target.value)}
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>请求路径（可选）</label>
                    <input
                      className={styles.input}
                      value={editing.path || ''}
                      onChange={e => update('path', e.target.value)}
                      placeholder="/chat/completions"
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>API 密钥</label>
                  <input
                    className={styles.input}
                    type="password"
                    value={editing.apiKey}
                    onChange={e => update('apiKey', e.target.value)}
                    placeholder="sk-..."
                    autoComplete="off"
                  />
                  <div className={styles.hint}>密钥经系统级 DPAPI 加密后存储于本地配置目录。</div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>超时（毫秒）</label>
                    <input
                      className={styles.input}
                      type="number"
                      min={3000}
                      step={1000}
                      value={editing.timeoutMs}
                      onChange={e => update('timeoutMs', Number(e.target.value) || 15000)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>
                      Temperature
                      <span className={styles.helpIcon} title="控制 AI 输出的随机性。值越低（如 0.1）回答越确定、保守；值越高（如 1.0）回答越发散、有创意。分析类任务建议使用 0.2~0.4。">?</span>
                    </label>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={editing.temperature ?? 0.3}
                      onChange={e => update('temperature', Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className={styles.testRow}>
                  <button className={styles.testBtn} onClick={handleTest} disabled={testing}>
                    {testing ? '⏳ 测试中...' : '🔌 测试连接'}
                  </button>
                  {testResult && (
                    <span className={`${styles.testResult} ${testResult.ok ? styles.testOk : styles.testFail}`}>
                      {testResult.ok ? '✓ ' : '✗ '}{testResult.message}
                    </span>
                  )}
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
