import { ThemeType } from '../../types'
import styles from './styles.module.css'

interface MenuBarProps {
  syncing: boolean
  theme: ThemeType
  onSync: () => void
  onToggleTheme: () => void
}

export default function MenuBar({ syncing, theme, onSync, onToggleTheme }: MenuBarProps) {
  return (
    <div className={styles.menuBar}>
      <div className={styles.left}>
        <span className={styles.title}>DynStav</span>
        <button
          className={styles.syncBtn}
          onClick={onSync}
          disabled={syncing}
          title="同步数据"
        >
          {syncing ? '⏳' : '🔄'} 同步数据
        </button>
      </div>
      <div className={styles.right}>
        <button
          className={styles.themeBtn}
          onClick={onToggleTheme}
          title={theme === 'dark' ? '切换亮色主题' : '切换暗色主题'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button className={styles.winBtn} onClick={() => window.electronAPI.minimizeWindow()} title="最小化">
          ─
        </button>
        <button className={styles.winBtn} onClick={() => window.electronAPI.maximizeWindow()} title="最大化">
          🗖
        </button>
        <button className={`${styles.winBtn} ${styles.closeBtn}`} onClick={() => window.electronAPI.closeWindow()} title="关闭">
          ✕
        </button>
      </div>
    </div>
  )
}
