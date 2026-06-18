import { ThemeType, FontSizeLevel } from '../../types'
import TitleBar from '../TitleBar'
import styles from './styles.module.css'

interface MenuBarProps {
  syncing: boolean
  theme: ThemeType
  fontSize: FontSizeLevel
  rightPanelVisible: boolean
  onSync: () => void
  onToggleTheme: () => void
  onRestore: () => void
  onGuide: () => void
  onChangeFontSize: () => void
  onToggleRightPanel: () => void
}

const FONT_LABELS: Record<FontSizeLevel, string> = {
  small: '小',
  medium: '中',
  large: '大'
}

export default function MenuBar({
  syncing, theme, fontSize, rightPanelVisible,
  onSync, onToggleTheme, onRestore, onGuide,
  onChangeFontSize, onToggleRightPanel
}: MenuBarProps) {
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
        <button
          className={styles.syncBtn}
          onClick={onRestore}
          title="数据恢复"
        >
          💾 数据恢复
        </button>
      </div>
      <div className={styles.right}>
        <button
          className={`${styles.aiPanelBtn} ${rightPanelVisible ? styles.aiPanelBtnActive : ''}`}
          onClick={onToggleRightPanel}
          title={rightPanelVisible ? '收起 AI 面板' : '展开 AI 面板'}
        >
          <span className={styles.aiIcon}>🤖</span>
          {rightPanelVisible && <span className={styles.aiDot} />}
        </button>
        <button
          className={styles.fontSizeBtn}
          onClick={onChangeFontSize}
          title={`字体大小：${FONT_LABELS[fontSize]}（点击切换）`}
        >
          <span className={styles.fontIcon}>A</span>
          <span className={styles.fontLabel}>{FONT_LABELS[fontSize]}</span>
        </button>
        <button
          className={styles.themeBtn}
          onClick={onGuide}
          title="使用指南"
        >
          ❓
        </button>
        <button
          className={styles.themeBtn}
          onClick={onToggleTheme}
          title={theme === 'dark' ? '切换亮色主题' : '切换暗色主题'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <TitleBar />
      </div>
    </div>
  )
}
