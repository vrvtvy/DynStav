import { useState, useEffect } from 'react'
import { ThsUserDirEntry } from '../../types'
import TitleBar from '../TitleBar'
import styles from './styles.module.css'

export default function Welcome({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [thsDirs, setThsDirs] = useState<ThsUserDirEntry[]>([])
  const [selectedDir, setSelectedDir] = useState('')
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  function handleThemeSelect(t: 'dark' | 'light') {
    setTheme(t)
  }

  async function handleNext() {
    setSearching(true)
    const dirs = await window.electronAPI.searchThsDirs()
    setThsDirs(dirs)
    setSearching(false)
    if (dirs.length === 1) {
      setSelectedDir(dirs[0].path)
    }
    setStep(2)
  }

  async function handleBrowse() {
    const dir = await window.electronAPI.openFolderDialog()
    if (dir) {
      setSelectedDir(dir)
      setThsDirs(prev => {
        if (prev.some(d => d.path === dir)) return prev
        return [...prev, { path: dir, label: dir }]
      })
    }
  }

  async function handleComplete() {
    if (!selectedDir) return
    await window.electronAPI.completeSetup({ theme, thsUserDir: selectedDir })
    onComplete()
  }

  if (step === 1) {
    return (
      <div className={styles.welcome}>
        <div className={styles.titleBarWrap}><TitleBar /></div>
        <div className={styles.container}>
          <div className={styles.logo}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="10" fill="var(--accent-primary)"/>
              <path d="M12 34L20 20L28 26L36 14" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className={styles.title}>DynStav</h1>
          <p className={styles.subtitle}>动态板块趋势分析可视化</p>

          <h2 className={styles.stepTitle}>选择主题</h2>
          <div className={styles.themeCards}>
            <div
              className={`${styles.themeCard} ${theme === 'dark' ? styles.themeCardActive : ''}`}
              onClick={() => handleThemeSelect('dark')}
            >
              <div className={styles.themePreviewDark}>
                <div className={styles.previewBar} />
                <div className={styles.previewSidebar} />
                <div className={styles.previewChart}>
                  <div className={styles.previewLine} />
                  <div className={styles.previewLine} style={{ width: '60%', top: 20 }} />
                </div>
              </div>
              <span className={styles.themeLabel}>暗色主题</span>
            </div>

            <div
              className={`${styles.themeCard} ${theme === 'light' ? styles.themeCardActive : ''}`}
              onClick={() => handleThemeSelect('light')}
            >
              <div className={styles.themePreviewLight}>
                <div className={styles.previewBar} />
                <div className={styles.previewSidebar} />
                <div className={styles.previewChart}>
                  <div className={styles.previewLine} />
                  <div className={styles.previewLine} style={{ width: '60%', top: 20 }} />
                </div>
              </div>
              <span className={styles.themeLabel}>亮色主题</span>
            </div>
          </div>

          <button className={styles.nextBtn} onClick={handleNext}>下一步</button>
        </div>
      </div>
    )
  }

  return (
      <div className={styles.welcome}>
        <div className={styles.titleBarWrap}><TitleBar /></div>
        <div className={styles.container}>
        <div className={styles.logo}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="10" fill="var(--accent-primary)"/>
            <path d="M12 34L20 20L28 26L36 14" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className={styles.title}>DynStav</h1>
        <p className={styles.subtitle}>动态板块趋势分析可视化</p>

        <h2 className={styles.stepTitle}>选择同花顺用户目录</h2>
        <p className={styles.desc}>
          搜索到以下包含 stockblock.ini 的同花顺用户目录，请选择你的账户目录：
        </p>

        {searching ? (
          <div className={styles.searching}>正在搜索...</div>
        ) : (
          <>
            <div className={styles.security}>
              DynStav 仅读取同花顺动态板块数据，所有数据均存储在本地，<br/>
              不会上传至任何服务器，也不会修改你的同花顺配置。
            </div>

            <div className={styles.dirList}>
              {thsDirs.length === 0 && (
                <div className={styles.noDirs}>未自动搜索到同花顺用户目录</div>
              )}
              {thsDirs.map((d, i) => (
                <div
                  key={i}
                  className={`${styles.dirItem} ${selectedDir === d.path ? styles.dirItemActive : ''}`}
                  onClick={() => setSelectedDir(d.path)}
                >
                  {d.label}
                </div>
              ))}
            </div>

            <div className={styles.dirActions}>
              <button className={styles.browseBtn} onClick={handleBrowse}>浏览文件夹...</button>
            </div>

            <div className={styles.tip}>
              DynStav 的数据完整性依赖于同花顺动态板块的每日更新。<br/>
              建议每日先打开同花顺更新动态板块数据，再打开 DynStav 同步数据，<br/>
              以保证趋势分析的连续性。
            </div>

            <button
              className={`${styles.completeBtn} ${selectedDir ? '' : styles.disabled}`}
              onClick={handleComplete}
              disabled={!selectedDir}
            >
              完成配置
            </button>
          </>
        )}
      </div>
    </div>
  )
}
