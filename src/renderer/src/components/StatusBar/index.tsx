import styles from './styles.module.css'

interface StatusBarProps {
  latestDate: string
}

export default function StatusBar({ latestDate }: StatusBarProps) {
  return (
    <div className={styles.statusBar}>
      <span className={styles.item}>
        {latestDate ? `最新数据: ${latestDate}` : '暂无数据'}
      </span>
    </div>
  )
}
