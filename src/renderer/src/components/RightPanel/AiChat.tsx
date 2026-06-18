import { useEffect, useRef, useState, useCallback } from 'react'
import {
  AiProviderConfig,
  BlockDailyStats,
  ChatMessage
} from '../../types'
import { buildBlockContext, renderMarkdown } from './context'
import styles from './AiChat.module.css'

interface AiChatProps {
  blockName: string
  blockCode: string
  stats: BlockDailyStats[]
  providers: AiProviderConfig[]
  activeProvider: AiProviderConfig | null
  onOpenConfig: () => void
}

interface UiMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** 是否处于流式接收中（仅 assistant） */
  streaming?: boolean
  error?: boolean
}

/** 预置快捷提问，符合需求 §5 的典型示例。 */
const QUICK_PROMPTS = [
  '这个板块当前趋势如何？',
  '从资金流向看是否存在短期机会？',
  '结合最近走势，这个板块风险点在哪里？'
]

function genMsgId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export default function AiChat({
  blockName,
  blockCode,
  stats,
  providers,
  activeProvider,
  onOpenConfig
}: AiChatProps) {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState('')
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null)
  const [history, setHistory] = useState<{ blockCode: string; blockName: string; messages: UiMessage[] }[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 监听 AI_CHAT_STARTED 事件：主进程在 streamChat 开始前立即推送 requestId，
  // 使渲染层能在首个 chunk 到达前设置 pendingRequestId，避免时序竞态。
  useEffect(() => {
    const unsub = window.electronAPI.onAiChatStarted((requestId) => {
      setPendingRequestId(requestId)
    })
    return unsub
  }, [])

  // 流式回调：监听主进程 chunk，按 requestId 追加到对应 assistant 消息
  useEffect(() => {
    const unsub = window.electronAPI.onAiChatChunk((data) => {
      if (data.requestId !== pendingRequestId) return
      const { delta, done, error } = data.chunk
      setMessages(prev => {
        const next = [...prev]
        // 流式消息固定为列表最后一条（assistant streaming）
        const last = next[next.length - 1]
        if (last && last.role === 'assistant' && last.streaming) {
          if (error) {
            last.content = last.content || ''
            last.error = true
            // 若已有内容保留内容，否则显示错误
            if (!last.content) last.content = error
            else last.content += `\n\n⚠️ ${error}`
            last.streaming = false
          } else if (delta) {
            last.content += delta
          } else if (done) {
            last.streaming = false
          }
          return [...next]
        }
        return prev
      })
      if (done) setPendingRequestId(null)
    })
    return unsub
  }, [pendingRequestId])

  // 切换板块时，把当前对话存入历史并清空（保留会话历史，符合需求 §2.4）
  useEffect(() => {
    if (messages.length > 0 && messages.some(m => m.role !== 'system')) {
      setHistory(prev => [
        { blockCode, blockName, messages },
        ...prev.filter(h => h.blockCode !== blockCode)
      ].slice(0, 20))
    }
    setMessages([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockCode])

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || pendingRequestId) return
      if (!hasProvider) {
        onOpenConfig()
        return
      }

      const userMsg: UiMessage = { id: genMsgId(), role: 'user', content }
      const assistantMsg: UiMessage = { id: genMsgId(), role: 'assistant', content: '', streaming: true }
      const context = buildBlockContext(blockName, blockCode, stats)

      setMessages(prev => [...prev, userMsg, assistantMsg])
      setInput('')
      // 发送后重置输入框高度
      requestAnimationFrame(resizeTextarea)

      // 构造发送给后端的消息：携带近期会话（最近 6 条）
      const recent: ChatMessage[] = [
        ...messages.filter(m => !m.error).slice(-6).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content }
      ]

      try {
        // requestId 已通过 AI_CHAT_STARTED 事件提前设置，此处 invoke 仅用于
        // 等待 streamChat 完成（方便未来做完成后的清理或重试逻辑）。
        await window.electronAPI.aiChat({
          providerId: activeProvider!.id,
          messages: recent,
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
          }
          return [...next]
        })
      }
    },
    [pendingRequestId, hasProvider, messages, blockName, blockCode, stats, activeProvider, onOpenConfig]
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
          if (!last.content) last.content = '（已停止）'
        }
        return [...next]
      })
    }
  }

  function handleClear() {
    setMessages([])
  }

  function handleReanalyze() {
    // 重新分析 = 复用最近用户提问；若无则发默认分析请求
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
          <button className={styles.toolBtn} onClick={handleReanalyze} disabled={!hasProvider || !!pendingRequestId} title="基于当前板块重新分析">🔄</button>
          <button className={styles.toolBtn} onClick={handleClear} disabled={!!pendingRequestId} title="清空对话">🧹</button>
          <button className={styles.toolBtn} onClick={onOpenConfig} title="API 配置">⚙️</button>
        </div>
      </div>

      {/* 模型选择 */}
      <div className={styles.modelBar}>
        <span className={styles.modelLabel}>模型：</span>
        <select
          className={styles.modelSelect}
          value={activeProvider?.id || ''}
          onChange={() => onOpenConfig()}
          disabled={providers.length === 0}
        >
          {providers.length === 0 && <option value="">未配置</option>}
          {providers.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* 对话区 */}
      <div className={styles.messages}>
        {messages.length === 0 && (
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
        )}

        {messages.map(m => (
          <div key={m.id} className={`${styles.msgRow} ${m.role === 'user' ? styles.msgUser : styles.msgAssistant}`}>
            <div className={`${styles.msgAvatar} ${m.role === 'user' ? styles.avatarUser : styles.avatarAssistant}`}>
              {m.role === 'user' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="8" r="4.5" fill="currentColor"/>
                  <path d="M3.5 21c0-4.14 3.86-7.5 8.5-7.5s8.5 3.36 8.5 7.5" fill="currentColor"/>
                </svg>
              ) : '🤖'}
            </div>
            <div className={`${styles.msgBubble} ${m.error ? styles.msgError : ''}`}>
              {m.role === 'assistant' && m.streaming && !m.content && (
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
                  <button
                    className={styles.copyBtn}
                    onClick={() => navigator.clipboard.writeText(m.content)}
                    title="复制"
                  >📋</button>
                </>
              )}
            </div>
          </div>
        ))}
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
            rows={2}
            disabled={!!pendingRequestId}
          />
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
                <path d="M12 4L12 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M5 11L12 4L19 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
