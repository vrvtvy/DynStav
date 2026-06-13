import { useState, useEffect } from 'react'
import styles from './styles.module.css'

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.electronAPI.getWindowMaximized().then(setMaximized)
    const unsub = window.electronAPI.onMaximizeChanged(setMaximized)
    return unsub
  }, [])

  return (
    <div className={styles.titleBar}>
      <button className={styles.winBtn} onClick={() => window.electronAPI.minimizeWindow()} title="最小化">
        <svg width="10" height="1" viewBox="0 0 10 1">
          <line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button className={styles.winBtn} onClick={() => window.electronAPI.maximizeWindow()} title={maximized ? '还原' : '最大化'}>
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="0.5" y="2.5" width="7" height="7" />
            <rect x="2.5" y="0.5" width="7" height="7" fill="var(--bg-surface)" stroke="currentColor" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="1" y="1" width="8" height="8" />
          </svg>
        )}
      </button>
      <button className={`${styles.winBtn} ${styles.closeBtn}`} onClick={() => window.electronAPI.closeWindow()} title="关闭">
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="2" y1="2" x2="8" y2="8" />
          <line x1="8" y1="2" x2="2" y2="8" />
        </svg>
      </button>
    </div>
  )
}
