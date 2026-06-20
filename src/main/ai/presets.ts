import { AiProviderTemplate } from '../../renderer/src/types'

/** 预设提供商定义（不含 apiKey 和模型，用户填写 Key 后通过 API 获取模型列表） */
export interface PresetProviderDef {
  /** 稳定标识，如 "deepseek" */
  presetId: string
  /** 显示名称 */
  name: string
  /** 适配模板 */
  template: AiProviderTemplate
  /** API 基础地址 */
  baseUrl: string
  /** 请求路径（相对 baseUrl） */
  path: string
  /** 1-2 字母缩写，用于 Logo 显示 */
  logo: string
  /** @lobehub/icons 的 provider key，用于显示官方品牌图标 */
  iconKey?: string
  /** 是否支持 /models 端点获取模型列表（Anthropic 等不支持） */
  supportsFetchModels?: boolean
}

/**
 * 预设提供商列表。
 * 国内在前，国际在后。新增提供商时追加即可，mergePresets 会自动注入。
 * 模型列表不预填充——各厂商模型更新频繁，由用户填写 API Key 后通过"获取模型列表"按钮拉取。
 */
export const PRESET_PROVIDERS: PresetProviderDef[] = [
  // ─── 国内 ───
  {
    presetId: 'deepseek',
    name: 'DeepSeek',
    template: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    path: '/chat/completions',
    logo: 'DS',
    iconKey: 'deepseek',
    supportsFetchModels: true,
  },
  {
    presetId: 'moonshot',
    name: 'Moonshot (Kimi)',
    template: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    path: '/chat/completions',
    logo: 'MK',
    iconKey: 'moonshot',
    supportsFetchModels: true,
  },
  {
    presetId: 'dashscope',
    name: '通义千问 (百炼)',
    template: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    path: '/chat/completions',
    logo: 'QW',
    iconKey: 'qwen',
    supportsFetchModels: true,
  },
  {
    presetId: 'zhipu',
    name: '智谱 AI',
    template: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    path: '/chat/completions',
    logo: 'GL',
    iconKey: 'zhipu',
    supportsFetchModels: true,
  },
  {
    presetId: 'volcengine',
    name: '火山引擎 (豆包)',
    template: 'openai',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    path: '/chat/completions',
    logo: 'DB',
    iconKey: 'volcengine',
    supportsFetchModels: true,
  },
  {
    presetId: 'minimax',
    name: 'MiniMax',
    template: 'openai',
    baseUrl: 'https://api.minimaxi.com/v1',
    path: '/chat/completions',
    logo: 'MM',
    iconKey: 'minimax',
    supportsFetchModels: true,
  },
  {
    presetId: 'xiaomi-mimo',
    name: 'Xiaomi MiMo',
    template: 'openai',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    path: '/chat/completions',
    logo: 'XM',
    iconKey: 'xiaomimimo',
    supportsFetchModels: true,
  },
  {
    presetId: 'siliconflow',
    name: '硅基流动',
    template: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    path: '/chat/completions',
    logo: 'SF',
    iconKey: 'siliconcloud',
    supportsFetchModels: true,
  },

  // ─── 国际 ───
  {
    presetId: 'openai',
    name: 'OpenAI',
    template: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    path: '/chat/completions',
    logo: 'O',
    iconKey: 'openai',
    supportsFetchModels: true,
  },
  {
    presetId: 'anthropic',
    name: 'Anthropic',
    template: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    path: '/v1/messages',
    logo: 'C',
    iconKey: 'anthropic',
    supportsFetchModels: false,
  },
  {
    presetId: 'google',
    name: 'Google Gemini',
    template: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    path: '/chat/completions',
    logo: 'G',
    iconKey: 'google',
    supportsFetchModels: true,
  },
  {
    presetId: 'groq',
    name: 'Groq',
    template: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    path: '/chat/completions',
    logo: 'GQ',
    iconKey: 'groq',
    supportsFetchModels: true,
  },
  {
    presetId: 'openrouter',
    name: 'OpenRouter',
    template: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    path: '/chat/completions',
    logo: 'OR',
    iconKey: 'openrouter',
    supportsFetchModels: true,
  },
]

/**
 * 将预设提供商合并到已有列表中。
 * - 按 presetId 匹配，不修改用户自定义的供应商
 * - 幂等：多次调用结果一致，不会重复注入
 * - 不覆盖用户已有的 apiKey、自定义模型等配置
 * - 预设不预填充模型，由用户填写 Key 后通过 API 获取
 */
export function mergePresets(
  existing: import('../../renderer/src/types').AiProviderConfig[]
): import('../../renderer/src/types').AiProviderConfig[] {
  const result = existing.map(p => ({ ...p }))
  const normalizeUrl = (url: string) => url.trim().toLowerCase().replace(/\/+$/, '')

  // ─── 迁移：为旧版预设供应商补充 presetId ───
  // 旧版本通过 baseUrl 匹配并打上 isPreset 标记，这里补充 presetId 以便后续稳定匹配
  for (const p of result) {
    if (p.isPreset && !p.presetId) {
      const matched = PRESET_PROVIDERS.find(
        pr => normalizeUrl(pr.baseUrl) === normalizeUrl(p.baseUrl)
      )
      if (matched) {
        p.presetId = matched.presetId
      }
    }
  }

  // ─── 收集已有 presetId ───
  const existingPresetIds = new Set<string>()
  for (const p of result) {
    if (p.presetId) {
      existingPresetIds.add(p.presetId)
    }
  }

  // ─── 注入缺失的预设供应商 ───
  for (const preset of PRESET_PROVIDERS) {
    if (existingPresetIds.has(preset.presetId)) {
      // 已存在：仅更新预设元数据（logo、icon 等），保留用户配置的名称、baseUrl、模型等
      const existing = result.find(p => p.presetId === preset.presetId)!
      existing.isPreset = true
      existing.presetLogo = preset.logo
      existing.presetIconKey = preset.iconKey
      continue
    }

    // 不存在：注入新预设（apiKey 为空，models 为空）
    const newProvider: import('../../renderer/src/types').AiProviderConfig = {
      id: `preset_${preset.presetId}_${Date.now().toString(36)}`,
      name: preset.name,
      template: preset.template,
      baseUrl: preset.baseUrl,
      path: preset.path,
      model: '',
      apiKey: '',
      timeoutMs: 30000,
      temperature: 0.3,
      models: [],
      isPreset: true,
      presetId: preset.presetId,
      presetLogo: preset.logo,
      presetIconKey: preset.iconKey,
    }

    result.push(newProvider)
  }

  return result
}
