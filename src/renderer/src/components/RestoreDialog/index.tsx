import { useState, useEffect, useCallback } from 'react'
import styles from './styles.module.css'

interface BackupFile {
  name: string
  path: string
}

interface RestoreDialogProps {
  open: boolean
  onClose: () => void
  onRestored: () => void
}

// 从文件名 dynstav-YYYY-MM-DD.db 提取日期部分，解析失败时回退原文件名
function formatDate(name: string): string {
  const match = name.match(/^dynstav-(\d{4}-\d{2}-\d{2})\.db$/)
  return match ? match[1] : name
}

export default function RestoreDialog({ open, onClose, onRestored }: RestoreDialogProps) {
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [selected, setSelected] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [backing, setBacking] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await window.electronAPI.listBackups()
      setBackups(list)
      if (list.length > 0) setSelected(list[0].path)
      else setSelected('')
    } catch (e) {
      setError('加载备份列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  // 监听恢复完成事件（主进程在 restoreFrom 成功后发送）
  useEffect(() => {
    if (!open) return
    const unsub = window.electronAPI.onBackupRestored(() => {
      setRestoring(false)
      onRestored()
    })
    return unsub
  }, [open, onRestored])

  // Esc 键关闭
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !restoring) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, restoring, onClose])

  async function handleBackupNow() {
    setBacking(true)
    setError('')
    try {
      await window.electronAPI.triggerBackup()
      await load()
    } catch (e) {
      setError('备份失败')
    } finally {
      setBacking(false)
    }
  }

  async function handleRestore() {
    if (!selected || restoring) return
    setRestoring(true)
    setError('')
    try {
      await window.electronAPI.restoreBackup(selected)
      // 成功后由 onBackupRestored 事件触发 onRestored 关闭弹框；
      // 若主进程未发送事件（兜底），这里也直接刷新
    } catch (e) {
      setRestoring(false)
      setError('恢复失败，请重试')
    }
  }

  if (!open) return null

  return (
    <div
      className={styles.overlay}
      onClick={() => { if (!restoring) onClose() }}
    >
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>数据恢复</span>
          <button
            className={styles.backupNowBtn}
            onClick={handleBackupNow}
            disabled={backing || restoring}
            title="立即备份当前数据"
          >
            {backing ? '⏳ 备份中...' : '＋ 立即备份'}
          </button>
        </div>

        {loading ? (
          <div className={styles.status}>加载中...</div>
        ) : backups.length === 0 ? (
          <div className={styles.status}>
            {error ? <span className={styles.error}>{error}</span> : '暂无备份文件'}
          </div>
        ) : (
          <div className={styles.list}>
            {backups.map((b) => (
              <div
                key={b.path}
                className={`${styles.item} ${selected === b.path ? styles.itemActive : ''}`}
                onClick={() => !restoring && setSelected(b.path)}
              >
                {formatDate(b.name)}
              </div>
            ))}
          </div>
        )}

        {error && backups.length > 0 && (
          <div className={`${styles.status} ${styles.error}`} style={{ padding: 'var(--spacing-sm) var(--spacing-lg)' }}>
            {error}
          </div>
        )}

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={restoring}>
            取消
          </button>
          <button
            className={styles.restoreBtn}
            onClick={handleRestore}
            disabled={!selected || restoring || backing}
          >
            {restoring ? '⏳ 恢复中...' : '恢复'}
          </button>
        </div>
      </div>
    </div>
  )
}
