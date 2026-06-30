import { useEffect, useRef, useState, useCallback } from 'react'
import {
  AiProviderConfig,
  AiModelConfig,
  AiProviderTemplate,
  BlockDailyStats,
  ChatMessage,
  ChatSession,
  ChatSessionMessage
} from '../../types'
import { buildBlockContext, renderMarkdown } from './context'
import ChatHistoryList from './ChatHistoryList'
import styles from './AiChat.module.css'
import { ProviderLogoIcon, providerIcons } from '../icons/providerIcons'
import yinYangIcon from '../../../../../resources/yin-yang.png'

interface AiChatProps {
  blockName: string
  blockCode: string
  stats: BlockDailyStats[]
  providers: AiProviderConfig[]
  activeProvider: AiProviderConfig | null
  activeModelId: string | null
  onModelChange: (providerId: string, modelId: string) => void
  onOpenConfig: () => void
}

interface UiMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** 模型思考/推理过程内容 */
  thinkingContent?: string
  /** 是否处于流式接收中（仅 assistant） */
  streaming?: boolean
  /** 思考内容是否正在流式接收中 */
  thinkingStreaming?: boolean
  error?: boolean
  /** token 用量（回复完成后由 onFinish 返回） */
  usage?: {
    inputTokens?: number
    outputTokens?: number
    reasoningTokens?: number
    totalTokens?: number
  }
  /** 是否触发了上下文自动压缩 */
  compressed?: boolean
}

/** 预置快捷提问，符合需求 §5 的典型示例。 */
const QUICK_PROMPTS = [
  '这个板块当前趋势如何？',
  '从资金流向看是否存在短期机会？',
  '结合最近走势，这个板块的风险点在哪里？'
]

function genMsgId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

function genSessionId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** 从消息列表提取会话标题（取第一条用户消息前 30 字） */
function deriveTitle(msgs: UiMessage[]): string {
  const first = msgs.find(m => m.role === 'user' && m.content)
  if (!first) return '新对话'
  return first.content.slice(0, 30) + (first.content.length > 30 ? '...' : '')
}

/** 供应商模板对应的 logo 颜色（fallback 用） */
const TEMPLATE_COLORS: Record<AiProviderTemplate, string> = {
  completion: '#10a37f',
  responses: '#0078d4',
  anthropic: '#d97706',
  custom: '#6b7280'
}

/** 供应商模板对应的 logo 字母（fallback 用） */
const TEMPLATE_LETTERS: Record<AiProviderTemplate, string> = {
  completion: 'C',
  responses: 'R',
  anthropic: 'C',
  custom: '?'
}

/** 模型供应商 Logo 组件：预设用品牌图标，非预设（用户自定义）用阴阳图 */
function ProviderLogo({
  template,
  size = 14,
  presetLogo,
  presetIconKey,
}: {
  template: AiProviderTemplate
  size?: number
  presetLogo?: string
  presetIconKey?: string
}) {
  if (presetIconKey && providerIcons[presetIconKey]) {
    return <ProviderLogoIcon iconKey={presetIconKey} size={size} />
  }

  if (presetIconKey) {
    const color = TEMPLATE_COLORS[template] ?? '#6b7280'
    const letter = presetLogo || TEMPLATE_LETTERS[template] || '?'
    const r = size / 2 - 1
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill={color} />
        <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="central"
          fill="#fff" fontSize={presetLogo && presetLogo.length > 1 ? size * 0.4 : size * 0.55} fontWeight="700" fontFamily="Arial, sans-serif">
          {letter}
        </text>
      </svg>
    )
  }

  return <img src={yinYangIcon} width={size} height={size} style={{ flexShrink: 0, display: 'block' }} />
}

/** 获取当前活跃模型的显示信息 */
function getActiveModelInfo(provider: AiProviderConfig | null, modelId: string | null) {
  if (!provider) return { name: '未配置', template: 'custom' as AiProviderTemplate, presetLogo: undefined, presetIconKey: undefined }
  const models = provider.models || []
  const model = (modelId ? models.find(m => m.id === modelId) : null) || models[0]
  return {
    name: model?.name || model?.model || provider.model || '未配置',
    template: provider.template,
    presetLogo: provider.presetLogo,
    presetIconKey: provider.presetIconKey,
  }
}

export default function AiChat({
  blockName,
  blockCode,
  stats,
  providers,
  activeProvider,
  activeModelId,
  onModelChange,
  onOpenConfig
}: AiChatProps) {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState('')
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  /** 思考区块展开状态：messageId -> boolean，默认流式中展开、完成后折叠 */
  const [thinkingExpanded, setThinkingExpanded] = useState<Record<string, boolean>>({})
  /** 记录用户是否手动折叠过思考区块（流式期间），防止后续 chunk 重新展开 */
  const userCollapsedRef = useRef<Set<string>>(new Set())
  /** 模型选择器下拉菜单 */
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const latestAssistantRef = useRef<HTMLDivElement>(null)
  const thinkingScrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // 切换板块时跳过首次自动保存（此时 messages 是空的初始状态）
  const isInitialMount = useRef(true)
  // 用 ref 持有最新消息，供切换板块的 effect 闭包中读取
  const messagesRef = useRef<UiMessage[]>([])
  messagesRef.current = messages
  // 追踪上一个板块信息，用于切换时保存旧会话
  const prevBlockRef = useRef({ blockCode, blockName })

  /** 自动调整输入框高度：随内容增长，最高 9 行后出滚动条 */
  function resizeTextarea() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const style = getComputedStyle(el)
    const fontSize = parseFloat(style.fontSize)
    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.4
    const paddingTop = parseFloat(style.paddingTop)
    const paddingBottom = parseFloat(style.paddingBottom)
    const borderTop = parseFloat(style.borderTopWidth)
    const borderBottom = parseFloat(style.borderBottomWidth)
    const maxH = Math.ceil(lineHeight * 9 + paddingTop + paddingBottom + borderTop + borderBottom)
    if (el.scrollHeight > maxH) {
      el.style.height = maxH + 'px'
      el.style.overflowY = 'auto'
    } else {
      el.style.height = el.scrollHeight + 'px'
      el.style.overflowY = 'hidden'
    }
  }

  const hasProvider = providers.length > 0 && !!activeProvider

  // ─── 会话持久化 ───

  /** 将当前消息保存到数据库（创建或更新会话） */
  const saveCurrentSession = useCallback(async () => {
    const toSave = messagesRef.current.filter(m => !m.streaming && m.content && m.role !== 'system')
    if (toSave.length === 0) return

    let sid = currentSessionId
    if (!sid) {
      sid = genSessionId()
      setCurrentSessionId(sid)
    }

    const now = new Date().toISOString()
    const session: ChatSession = {
      id: sid,
      blockCode,
      blockName,
      title: deriveTitle(toSave),
      createdAt: now,
      updatedAt: now
    }
    const dbMessages: ChatSessionMessage[] = toSave.map(m => ({
      id: m.id,
      sessionId: sid!,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      thinkingContent: m.thinkingContent,
      createdAt: now,
      error: m.error,
      usage: m.usage
    }))

    await window.electronAPI.aiSaveSession({ session, messages: dbMessages })
  }, [currentSessionId, blockCode, blockName])

  /** 从数据库加载会话消息并展示 */
  const loadSessionMessages = useCallback(async (sessionId: string) => {
    const dbMsgs = await window.electronAPI.aiGetSession(sessionId)
    const uiMsgs: UiMessage[] = dbMsgs.map(m => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      thinkingContent: m.thinkingContent || undefined,
      error: m.error || false,
      usage: m.usage
    }))
    setMessages(uiMsgs)
    setCurrentSessionId(sessionId)
    // 从历史加载的消息默认折叠思考区块
    const expanded: Record<string, boolean> = {}
    uiMsgs.forEach(m => { if (m.thinkingContent) expanded[m.id] = false })
    setThinkingExpanded(expanded)
  }, [])

  // ─── 切换板块 / 初始加载 ───

  useEffect(() => {
    const prevMessages = messagesRef.current
    const prevSessionId = currentSessionId

    // 非首次挂载且有消息 -> 保存上一个板块的会话
    if (!isInitialMount.current && prevMessages.length > 0 && prevMessages.some(m => m.role !== 'system') && prevSessionId) {
      const toSave = prevMessages.filter(m => !m.streaming && m.content && m.role !== 'system')
      if (toSave.length > 0) {
        const now = new Date().toISOString()
        const { blockCode: prevCode, blockName: prevName } = prevBlockRef.current
        window.electronAPI.aiSaveSession({
          session: {
            id: prevSessionId,
            blockCode: prevCode,
            blockName: prevName,
            title: deriveTitle(toSave),
            createdAt: now,
            updatedAt: now
          },
          messages: toSave.map(m => ({
            id: m.id,
            sessionId: prevSessionId,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            thinkingContent: m.thinkingContent,
            createdAt: now,
            error: m.error,
            usage: m.usage
          }))
        })
      }
    }
    // 更新 prevBlockRef 为当前板块
    prevBlockRef.current = { blockCode, blockName }
    isInitialMount.current = false

    // 清空当前状态
    setMessages([])
    setCurrentSessionId(null)
    setHistoryOpen(false)

    // 加载目标板块的最近会话
    window.electronAPI.aiListSessions(blockCode).then(list => {
      setSessions(list)
      if (list.length > 0) {
        loadSessionMessages(list[0].id)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockCode])

  // AI 回复完成后自动保存会话
  useEffect(() => {
    if (pendingRequestId) return // 流式进行中不保存
    if (messages.length === 0) return
    const hasAssistant = messages.some(m => m.role === 'assistant' && !m.streaming && m.content)
    if (!hasAssistant) return
    saveCurrentSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, pendingRequestId])

  // 正文区滚动：流式时确保最新回答的头像和开头在可视区域内
  useEffect(() => {
    const container = messagesContainerRef.current
    const msgEl = latestAssistantRef.current
    if (!container || !msgEl) return
    const targetScroll = Math.max(0, msgEl.offsetTop - 45)
    if (container.scrollTop < targetScroll) {
      container.scrollTop = targetScroll
    }
  }, [messages])

  // 思考区块内部自动滚动到底部（仅在思考流式更新时触发）
  const thinkingStreamingCount = messages.filter(m => m.thinkingStreaming).length
  useEffect(() => {
    const el = thinkingScrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [thinkingStreamingCount])

  // 监听 AI_CHAT_STARTED 事件
  useEffect(() => {
    const unsub = window.electronAPI.onAiChatStarted((requestId) => {
      setPendingRequestId(requestId)
    })
    return unsub
  }, [])

  // 流式回调
  useEffect(() => {
    const unsub = window.electronAPI.onAiChatChunk((data) => {
      if (data.requestId !== pendingRequestId) return
      const { delta, thinking, done, error, usage, compressed } = data.chunk
      setMessages(prev => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === 'assistant' && last.streaming) {
          if (error) {
            last.content = last.content || ''
            last.error = true
            if (!last.content) last.content = error
            else last.content += `\n\n⚠️ ${error}`
            last.streaming = false
            last.thinkingStreaming = false
            userCollapsedRef.current.delete(last.id)
          } else if (thinking) {
            last.thinkingContent = (last.thinkingContent || '') + thinking
            last.thinkingStreaming = true
            if (!userCollapsedRef.current.has(last.id)) {
              setThinkingExpanded(prev => ({ ...prev, [last.id]: true }))
            }
          } else if (delta) {
            last.content += delta
          } else if (done) {
            last.streaming = false
            last.thinkingStreaming = false
            userCollapsedRef.current.delete(last.id)
            if (last.thinkingContent) {
              setThinkingExpanded(prev => ({ ...prev, [last.id]: false }))
            }
            // 捕获 token 用量和压缩标记
            if (usage) last.usage = usage
            if (compressed) last.compressed = compressed
          }
          return [...next]
        }
        return prev
      })
      if (done) setPendingRequestId(null)
    })
    return unsub
  }, [pendingRequestId])

  // 点击外部关闭模型选择器
  useEffect(() => {
    if (!modelPickerOpen) return
    function handleClick(e: MouseEvent) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [modelPickerOpen])

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || pendingRequestId) return
      if (!hasProvider) {
        onOpenConfig()
        return
      }

      if (!currentSessionId) {
        setCurrentSessionId(genSessionId())
      }

      const userMsg: UiMessage = { id: genMsgId(), role: 'user', content }
      const assistantMsg: UiMessage = { id: genMsgId(), role: 'assistant', content: '', streaming: true }
      const context = buildBlockContext(blockName, blockCode, stats)

      setMessages(prev => [...prev, userMsg, assistantMsg])
      setInput('')
      requestAnimationFrame(resizeTextarea)

      // 发送全部历史消息（主进程 ContextManager 负责 token 感知截断和摘要压缩）
      const allMessages: ChatMessage[] = [
        ...messages.filter(m => !m.error && m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content }
      ]

      try {
        await window.electronAPI.aiChat({
          providerId: activeProvider!.id,
          activeModelId: activeModelId || undefined,
          messages: allMessages,
          context
        })
      } catch (e: any) {
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'assistant' && last.streaming) {
            last.content = `请求发送失败：${e?.message || e}`
            last.error = true
            last.streaming = false
            last.thinkingStreaming = false
          }
          return [...next]
        })
      }
    },
    [pendingRequestId, hasProvider, messages, blockName, blockCode, stats, activeProvider, activeModelId, onOpenConfig, currentSessionId]
  )

  function handleStop() {
    if (pendingRequestId) {
      window.electronAPI.aiCancel(pendingRequestId)
      setPendingRequestId(null)
      setMessages(prev => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === 'assistant' && last.streaming) {
          last.streaming = false
          last.thinkingStreaming = false
          userCollapsedRef.current.delete(last.id)
          if (!last.content) last.content = '（已停止）'
          if (last.thinkingContent) {
            setThinkingExpanded(prev => ({ ...prev, [last.id]: false }))
          }
        }
        return [...next]
      })
    }
  }

  function handleClear() {
    setMessages([])
    setCurrentSessionId(null)
    setThinkingExpanded({})
  }

  /** 重试失败的 AI 请求：找到失败消息之前的最后一条用户消息并重新发送。 */
  function handleRetry(failedMsgId: string) {
    const idx = messages.findIndex(m => m.id === failedMsgId)
    if (idx === -1) return
    // 向前查找最近的一条用户消息
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        send(messages[i].content)
        return
      }
    }
  }

  function handleReanalyze() {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    const prompt = lastUser?.content || `请综合分析「${blockName}」板块的当前走势、资金流向、风险与机会。`
    send(prompt)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  // ─── 历史会话操作 ───

  async function handleOpenHistory() {
    const list = await window.electronAPI.aiListSessions(blockCode)
    setSessions(list)
    setHistoryOpen(true)
  }

  async function handleSelectSession(sessionId: string) {
    if (sessionId === currentSessionId) {
      setHistoryOpen(false)
      return
    }
    await loadSessionMessages(sessionId)
    setHistoryOpen(false)
  }

  async function handleDeleteSession(sessionId: string) {
    await window.electronAPI.aiDeleteSession(sessionId)
    if (sessionId === currentSessionId) {
      setMessages([])
      setCurrentSessionId(null)
    }
    const list = await window.electronAPI.aiListSessions(blockCode)
    setSessions(list)
  }

  // ─── 模型选择器数据 ───

  const modelInfo = getActiveModelInfo(activeProvider, activeModelId)

  /** 获取所有可用模型，按供应商分组（仅列出已配置 API Key 的供应商） */
  const modelGroups = providers
    .filter(p => p.apiKey && p.apiKey.trim())
    .map(p => ({
      provider: p,
      models: (p.models || []).filter(m => m.model)
    })).filter(g => g.models.length > 0)

  function handlePickModel(providerId: string, modelId: string) {
    onModelChange(providerId, modelId)
    setModelPickerOpen(false)
  }

  return (
    <div className={styles.chat}>
      {/* 顶部：板块上下文摘要 + 工具栏 */}
      <div className={styles.contextBar}>
        <div className={styles.contextInfo}>
          <span className={styles.contextIcon}>📊</span>
          <span className={styles.contextName} title={blockName}>{blockName || '未选择板块'}</span>
          {stats.length > 0 && (
            <span className={styles.contextMeta}>
              {stats.length}日 · 最新 {stats[stats.length - 1].avgChangePercent.toFixed(2)}%
            </span>
          )}
        </div>
        <div className={styles.toolbar}>
          <button className={styles.toolBtn} onClick={handleClear} disabled={!!pendingRequestId} title="新建对话">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
          <button className={styles.toolBtn} onClick={handleOpenHistory} title="历史对话">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 12a9 9 0 1 0 2.636-6.364" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M3 4v4.5h4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className={styles.toolBtn} onClick={handleReanalyze} disabled={!hasProvider || !!pendingRequestId} title="基于当前板块重新分析">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 3v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 21v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className={styles.toolBtn} onClick={onOpenConfig} title="API 配置">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* 对话区 / 历史列表 */}
      <div className={styles.messages} ref={messagesContainerRef}>
        {historyOpen ? (
          <ChatHistoryList
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelect={handleSelectSession}
            onDelete={handleDeleteSession}
            onBack={() => setHistoryOpen(false)}
          />
        ) : messages.length === 0 ? (
          <div className={styles.welcome}>
            <div className={styles.welcomeIcon}>🤖</div>
            <div className={styles.welcomeTitle}>AI 板块分析</div>
            <div className={styles.welcomeText}>
              {hasProvider
                ? `已就绪。基于「${blockName || '当前板块'}」的真实行情数据进行分析。`
                : '尚未配置 AI 模型，点击下方按钮添加你的 API。'}
            </div>
            {hasProvider ? (
              <div className={styles.quickPrompts}>
                {QUICK_PROMPTS.map(q => (
                  <button key={q} className={styles.quickPrompt} onClick={() => send(q)}>
                    {q}
                  </button>
                ))}
              </div>
            ) : (
              <button className={styles.configCta} onClick={onOpenConfig}>⚙️ 配置 AI 模型</button>
            )}
          </div>
        ) : (
          (() => {
            const lastAssistantId = [...messages].reverse().find(m => m.role === 'assistant')?.id
            return messages.map(m => (
              <div
                key={m.id}
                className={`${styles.msgRow} ${m.role === 'user' ? styles.msgUser : styles.msgAssistant}`}
                ref={m.id === lastAssistantId ? latestAssistantRef : undefined}
              >
                <div className={`${styles.msgAvatar} ${m.role === 'user' ? styles.avatarUser : styles.avatarAssistant}`}>
                  {m.role === 'user' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="8" r="4.5" fill="currentColor" />
                      <path d="M3.5 21c0-4.14 3.86-7.5 8.5-7.5s8.5 3.36 8.5 7.5" fill="currentColor" />
                    </svg>
                  ) : '🤖'}
                </div>
                <div className={`${styles.msgBubble} ${m.error ? styles.msgError : ''}`}>
                  {/* 思考过程区块（可折叠） */}
                  {m.role === 'assistant' && m.thinkingContent && (
                    <div className={styles.thinkingSection}>
                      <button
                        className={styles.thinkingToggle}
                        onClick={() => {
                          const willCollapse = thinkingExpanded[m.id]
                          setThinkingExpanded(prev => ({ ...prev, [m.id]: !prev[m.id] }))
                          if (willCollapse === true && m.thinkingStreaming) {
                            userCollapsedRef.current.add(m.id)
                          }
                        }}
                      >
                        <svg
                          className={`${styles.thinkingArrow} ${thinkingExpanded[m.id] ? styles.thinkingArrowOpen : ''}`}
                          width="10" height="10" viewBox="0 0 24 24" fill="none"
                        >
                          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className={styles.thinkingLabel}>
                          {m.thinkingStreaming ? '思考中…' : '思考过程'}
                        </span>
                        {/* P0: 折叠时显示字符数 + 首行摘要 */}
                        {!thinkingExpanded[m.id] && (
                          <span className={styles.thinkingSummary} title={m.thinkingContent.slice(0, 60)}>
                            {m.thinkingContent.length > 40
                              ? m.thinkingContent.slice(0, 40).replace(/\n.*/, '') + '…'
                              : m.thinkingContent.slice(0, 40)}
                          </span>
                        )}
                        <span className={styles.thinkingStats}>
                          {m.thinkingContent.length}字
                        </span>
                        {m.thinkingStreaming && (
                          <span className={styles.thinkingPulse} />
                        )}
                      </button>
                      {/* P1: 过渡动画包装 */}
                      <div
                        className={`${styles.thinkingContentWrapper} ${thinkingExpanded[m.id] ? styles.thinkingContentWrapperOpen : ''}`}
                      >
                        <div
                          className={styles.thinkingContent}
                          ref={m.streaming ? thinkingScrollRef : undefined}
                        >
                          <div
                            className={styles.thinkingText}
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(m.thinkingContent) }}
                          />
                          {/* P2: 思考内容复制按钮 */}
                          {!m.streaming && (
                            <button
                              className={styles.thinkingCopyBtn}
                              onClick={() => navigator.clipboard.writeText(m.thinkingContent || '')}
                              title="复制思考过程"
                            >📋</button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 正在思考但尚无内容时的占位指示 */}
                  {m.role === 'assistant' && m.streaming && !m.content && !m.thinkingContent && (
                    <span className={styles.typing}>
                      <span className={styles.dot} />
                      <span className={styles.dot} />
                      <span className={styles.dot} />
                    </span>
                  )}
                  {m.content && (
                    <div
                      className={styles.msgContent}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                    />
                  )}
                  {m.role === 'assistant' && !m.streaming && m.content && !m.error && (
                    <>
                      <div className={styles.disclaimer}>
                        以上内容由 AI 生成，仅供参考，不构成任何投资建议。投资有风险，入市需谨慎。
                      </div>
                      {(m.usage || m.compressed) && (
                        <div className={styles.msgMeta}>
                          {m.compressed && (
                            <span className={styles.msgMetaCompressed} title="历史对话过长，已自动压缩为摘要">
                              ⚡ 已压缩历史
                            </span>
                          )}
                          {m.compressed && m.usage && <span className={styles.msgMetaSep}>·</span>}
                          {m.usage && (
                            <>
                              {typeof m.usage.inputTokens === 'number' && (
                                <span title="输入 token 数">输入 {m.usage.inputTokens.toLocaleString()}</span>
                              )}
                              {typeof m.usage.outputTokens === 'number' && (
                                <>
                                  <span className={styles.msgMetaSep}>·</span>
                                  <span title="输出 token 数">输出 {m.usage.outputTokens.toLocaleString()}</span>
                                </>
                              )}
                              {typeof m.usage.reasoningTokens === 'number' && m.usage.reasoningTokens > 0 && (
                                <>
                                  <span className={styles.msgMetaSep}>·</span>
                                  <span title="推理 token 数">思考 {m.usage.reasoningTokens.toLocaleString()}</span>
                                </>
                              )}
                              <span className={styles.msgMetaSep}>token</span>
                            </>
                          )}
                        </div>
                      )}
                      <button
                        className={styles.copyBtn}
                        onClick={() => navigator.clipboard.writeText(m.content)}
                        title="复制"
                      >📋</button>
                    </>
                  )}
                  {m.role === 'assistant' && !m.streaming && m.content && m.error && (
                    <button className={styles.retryBtn} onClick={() => handleRetry(m.id)}>
                      🔄 重新发送
                    </button>
                  )}
                </div>
              </div>
            ))
          })()
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div className={styles.inputArea}>
        <div className={styles.inputBox}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={input}
            onChange={e => { setInput(e.target.value); resizeTextarea() }}
            onKeyDown={handleKeyDown}
            placeholder={hasProvider ? `向 AI 提问「${blockName || '当前板块'}」... (Enter 发送，Shift+Enter 换行)` : '请先配置 AI 模型'}
            rows={3}
            disabled={!!pendingRequestId}
          />
          {/* 模型选择器 */}
          {hasProvider && (
            <div className={styles.modelSelector} ref={modelPickerRef}>
              <button
                className={styles.modelSelectorBtn}
                onClick={() => setModelPickerOpen(!modelPickerOpen)}
                title="切换模型"
              >
                <ProviderLogo template={modelInfo.template} size={14} presetLogo={modelInfo.presetLogo} presetIconKey={modelInfo.presetIconKey} />
                <span className={styles.modelSelectorName}>{modelInfo.name}</span>
                <svg className={styles.modelSelectorArrow} width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {modelPickerOpen && (
                <div className={styles.modelPicker}>
                  {modelGroups.map(g => (
                    <div key={g.provider.id} className={styles.modelGroup}>
                      <div className={styles.modelGroupHeader}>
                        <ProviderLogo template={g.provider.template} size={12} presetLogo={g.provider.presetLogo} presetIconKey={g.provider.presetIconKey} />
                        <span className={styles.modelGroupName}>{g.provider.name}</span>
                      </div>
                      {g.models.map((m: AiModelConfig) => {
                        const isActive = g.provider.id === activeProvider?.id && m.id === activeModelId
                        return (
                          <button
                            key={m.id}
                            className={`${styles.modelPickItem} ${isActive ? styles.modelPickActive : ''}`}
                            onClick={() => handlePickModel(g.provider.id, m.id)}
                          >
                            <ProviderLogo template={g.provider.template} size={14} presetLogo={g.provider.presetLogo} presetIconKey={g.provider.presetIconKey} />
                            <span className={styles.modelPickName}>{m.name || m.model}</span>
                            {isActive && <span className={styles.modelPickCheck}>✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                  <div className={styles.modelPickerFooter}>
                    <button className={styles.configModelBtn} onClick={() => { setModelPickerOpen(false); onOpenConfig() }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      配置模型
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {pendingRequestId ? (
            <button className={styles.stopBtn} onClick={handleStop} title="停止生成">⏹</button>
          ) : (
            <button
              className={styles.sendBtn}
              onClick={() => send(input)}
              disabled={!input.trim() || !hasProvider}
              title="发送"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4L12 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M5 11L12 4L19 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
