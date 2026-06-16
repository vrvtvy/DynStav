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
  const [syncing, setSyncing] = useState(false)
  const [appDirs, setAppDirs] = useState<{ label: string; path: string }[]>([])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  function handleThemeSelect(t: 'dark' | 'light') {
    setTheme(t)
  }

  async function handleNext() {
    if (step === 1) {
      setSearching(true)
      const [dirs, paths] = await Promise.all([
        window.electronAPI.searchThsDirs(),
        window.electronAPI.getAppDirs()
      ])
      setThsDirs(dirs)
      setAppDirs(paths)
      setSearching(false)
      if (dirs.length === 1) {
        setSelectedDir(dirs[0].path)
      }
    }
    setStep(step + 1)
  }

  async function handleBrowse() {
    const dir = await window.electronAPI.openFolderDialog()
    if (!dir) return

    const result = await window.electronAPI.resolveThsDir(dir)

    if (result.type === 'installRoot' && result.dirs && result.dirs.length > 0) {
      // 选到了安装根目录，列出 mx_* 子目录供用户选择
      setThsDirs(prev => {
        const merged = [...prev]
        for (const d of result.dirs!) {
          if (!merged.some(m => m.path === d.path)) merged.push(d)
        }
        return merged
      })
      if (result.dirs.length === 1) {
        setSelectedDir(result.dirs[0].path)
      }
    } else {
      // userDir 或 unknown，直接使用
      const usePath = result.path || dir
      setSelectedDir(usePath)
      setThsDirs(prev => {
        if (prev.some(d => d.path === usePath)) return prev
        return [...prev, { path: usePath, label: usePath }]
      })
    }
  }

  async function handleComplete() {
    if (!selectedDir) return
    setSyncing(true)
    try {
      await window.electronAPI.completeSetup({ theme, thsUserDir: selectedDir })
      onComplete()
    } catch (e) {
      setSyncing(false)
    }
  }

  /* ─── Shared chrome: draggable frame + TitleBar + scrollable body ─── */
  return (
    <div className={styles.welcome}>
      <div className={styles.titleBarWrap}><TitleBar /></div>
      <div className={styles.body}>

        {/* ────────── Step 1: 选择主题 ────────── */}
        {step === 1 && (
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
        )}

        {/* ────────── Step 2: 配置同花顺目录 ────────── */}
        {step === 2 && (
          <div className={styles.container}>
            {/* 步骤指示器 */}
            <div className={styles.stepIndicator}>
              <div className={styles.stepItem}>
                <div className={`${styles.stepNumber} ${styles.stepNumberDone}`}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className={styles.stepLabel}>选择主题</span>
              </div>
              <div className={styles.stepLine} />
              <div className={styles.stepItem}>
                <div className={`${styles.stepNumber} ${styles.stepNumberActive}`}>2</div>
                <span className={`${styles.stepLabel} ${styles.stepLabelActive}`}>配置目录</span>
              </div>
              <div className={styles.stepLine} />
              <div className={styles.stepItem}>
                <div className={styles.stepNumber}>3</div>
                <span className={styles.stepLabel}>使用说明</span>
              </div>
            </div>

            {/* ── 安全提示（置顶 + 黄色） ── */}
            <div className={styles.securityCard}>
              <svg className={styles.cardIcon} viewBox="0 0 24 24" fill="none" stroke="var(--accent-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <div className={styles.cardContent}>
                <h3 className={styles.cardTitle} style={{ color: 'var(--accent-warning)' }}>安全说明</h3>
                <p className={styles.cardText}>
                  DynStav 仅以<span className={styles.hlWarn}>只读方式</span>读取同花顺的动态板块配置文件，
                  不会修改、覆盖或影响同花顺的任何数据和设置。<br/>
                  所有分析数据均存储在本机，不会上传至任何服务器，请放心使用。
                </p>
              </div>
            </div>

            {/* ── 软件使用目录 ── */}
            <div className={styles.dirCard}>
              <svg className={styles.cardIcon} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              <div className={styles.cardContent}>
                <h3 className={styles.cardTitle}>软件使用目录</h3>
                <p className={styles.cardText}>运行过程中会在以下位置存储配置和数据：</p>
                <div className={styles.pathGrid}>
                  {appDirs.map((p, i) => (
                    <div key={i} className={styles.pathItem}>
                      <span className={styles.pathTag}>{p.label}</span>
                      <span className={styles.pathValue}>{p.path}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── 选择同花顺用户目录 ── */}
            <h2 className={styles.sectionTitle}>选择同花顺用户目录</h2>

            {searching ? (
              <div className={styles.searching}>正在搜索...</div>
            ) : (
              <>
                <p className={styles.desc}>
                  {thsDirs.length > 0
                    ? '搜索到以下包含 stockblock.ini 的同花顺用户目录，请选择你的账户目录：'
                    : '未自动搜索到同花顺用户目录，请点击下方按钮手动选择。'}
                </p>

                <div className={styles.dirList}>
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
              </>
            )}

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(1)}>上一步</button>
              <button
                className={`${styles.nextBtn} ${selectedDir ? '' : styles.disabled}`}
                onClick={handleNext}
                disabled={!selectedDir}
              >
                下一步
              </button>
            </div>
          </div>
        )}

        {/* ────────── Step 3: 使用说明 ────────── */}
        {step === 3 && (
          <div className={styles.container}>
            {/* 步骤指示器 */}
            <div className={styles.stepIndicator}>
              <div className={styles.stepItem}>
                <div className={`${styles.stepNumber} ${styles.stepNumberDone}`}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className={styles.stepLabel}>选择主题</span>
              </div>
              <div className={styles.stepLine} />
              <div className={styles.stepItem}>
                <div className={`${styles.stepNumber} ${styles.stepNumberDone}`}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className={styles.stepLabel}>配置目录</span>
              </div>
              <div className={styles.stepLine} />
              <div className={styles.stepItem}>
                <div className={`${styles.stepNumber} ${styles.stepNumberActive}`}>3</div>
                <span className={`${styles.stepLabel} ${styles.stepLabelActive}`}>使用说明</span>
              </div>
            </div>

            {/* ── 使用教程（蓝色） ── */}
            <div className={styles.tutorialCard}>
              <svg className={styles.cardIcon} viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4"/>
                <path d="M12 8h.01"/>
              </svg>
              <div className={styles.cardContent}>
                <h3 className={styles.cardTitle} style={{ color: 'var(--accent-primary)' }}>使用指南</h3>
                <p className={styles.cardTextBlue}>
                  DynStav 的分析数据完全依赖同花顺动态板块的每日更新。<br/>
                  为了获得准确的分析结果，建议您按照以下流程操作：
                </p>
                <div className={styles.tutorialSteps}>
                  <div className={styles.tutorialStep}>
                    <span className={styles.tutorialNum}>1</span>
                    <span>每日收盘后，打开同花顺并刷新动态板块数据</span>
                  </div>
                  <div className={styles.tutorialStep}>
                    <span className={styles.tutorialNum}>2</span>
                    <span>打开 DynStav，点击同步按钮导入当日数据</span>
                  </div>
                  <div className={styles.tutorialStep}>
                    <span className={styles.tutorialNum}>3</span>
                    <span>数据同步完成后即可查看最新的趋势分析</span>
                  </div>
                </div>
                <p className={styles.cardTextBlue}>
                  收盘后同步可确保数据的准确性，使趋势分析真实反映市场变化，<br/>
                  从而发挥 DynStav 的最大使用价值。
                </p>
                <p className={styles.cardTextBlue}>
                  首次同步后仅显示当天的数据，暂时无法观察变化趋势。<br/>
                  连续使用多天、每日坚持同步后，趋势图表才会逐渐呈现出<br/>
                  完整的走势变化，届时分析结果才更具参考价值。
                </p>
              </div>
            </div>

            {/* ── 免责声明（红色） ── */}
            <div className={styles.disclaimerCard}>
              <svg className={styles.cardIcon} viewBox="0 0 24 24" fill="none" stroke="var(--accent-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div className={styles.cardContent}>
                <h3 className={styles.cardTitle} style={{ color: 'var(--accent-danger)' }}>免责声明</h3>
                <p className={styles.cardTextRed}>
                  本软件仅提供数据可视化与趋势分析功能，不构成任何形式的投资建议。
                  股市有风险，投资需谨慎。所有投资决策应基于您自身的独立判断，
                  本软件及其开发者不对因使用本软件而产生的任何投资损失承担责任。
                  请您在使用本软件前充分了解相关风险，理性投资。
                </p>
              </div>
            </div>

            <div className={styles.navRow}>
              <button className={styles.backBtn} onClick={() => setStep(2)}>上一步</button>
              <button
                className={`${styles.completeBtn} ${selectedDir ? '' : styles.disabled}`}
                onClick={handleComplete}
                disabled={!selectedDir}
              >
                完成配置
              </button>
            </div>
          </div>
        )}

      </div>

      {/* 首次同步数据 Loading */}
      {syncing && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingContent}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>正在同步数据，请稍候...</p>
          </div>
        </div>
      )}
    </div>
  )
}
