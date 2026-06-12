import styles from './styles.module.css'

export default function RightPanel() {
  return (
    <div className={styles.panel}>
      <div className={styles.placeholder}>
        <p>AI 分析</p>
        <p className={styles.hint}>功能开发中...</p>
      </div>
    </div>
  )
}
