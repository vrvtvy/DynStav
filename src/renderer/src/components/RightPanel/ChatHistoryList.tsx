import { ChatSession } from '../../types'
import styles from './ChatHistoryList.module.css'

interface ChatHistoryListProps {
  sessions: ChatSession[]
  currentSessionId: string | null
  onSelect: (sessionId: string) => void
  onDelete: (sessionId: string) => void
  onBack: () => void
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return ''
  }
}

export default function ChatHistoryList({
  sessions,
  currentSessionId,
  onSelect,
  onDelete,
  onBack
}: ChatHistoryListProps) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack} title="返回对话">← 返回</button>
        <span className={styles.headerTitle}>历史对话</span>
      </div>
      {sessions.length === 0 ? (
        <div className={styles.empty}>暂无历史对话记录</div>
      ) : (
        <div className={styles.list}>
          {sessions.map(s => (
            <div
              key={s.id}
              className={`${styles.item} ${s.id === currentSessionId ? styles.itemActive : ''}`}
              onClick={() => onSelect(s.id)}
            >
              <div className={styles.itemMain}>
                <div className={styles.itemTitle}>{s.title || '未命名对话'}</div>
                <div className={styles.itemMeta}>
                  <span>{formatTime(s.updatedAt)}</span>
                  {s.messageCount !== undefined && <span>{s.messageCount} 条消息</span>}
                </div>
              </div>
              <button
                className={styles.deleteBtn}
                onClick={e => { e.stopPropagation(); onDelete(s.id) }}
                title="删除此对话"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
