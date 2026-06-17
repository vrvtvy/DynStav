import welcomeStyles from '../Welcome/styles.module.css'

export default function GuideContent() {
  return (
    <>
      {/* ── 免责声明（红色） ── */}
      <div className={welcomeStyles.disclaimerCard}>
        <svg className={welcomeStyles.cardIcon} viewBox="0 0 24 24" fill="none" stroke="var(--accent-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div className={welcomeStyles.cardContent}>
          <h3 className={welcomeStyles.cardTitle} style={{ color: 'var(--accent-danger)' }}>免责声明</h3>
          <p className={welcomeStyles.cardTextRed}>
            本软件仅提供数据可视化与趋势分析功能，不构成任何形式的投资建议。
            股市有风险，投资需谨慎。所有投资决策应基于您自身的独立判断，
            本软件及其开发者不对因使用本软件而产生的任何投资损失承担责任。
            请您在使用本软件前充分了解相关风险，理性投资。
          </p>
        </div>
      </div>

      {/* ── 使用教程（蓝色） ── */}
      <div className={welcomeStyles.tutorialCard}>
        <svg className={welcomeStyles.cardIcon} viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4"/>
          <path d="M12 8h.01"/>
        </svg>
        <div className={welcomeStyles.cardContent}>
          <h3 className={welcomeStyles.cardTitle} style={{ color: 'var(--accent-primary)' }}>使用指南</h3>
          <p className={welcomeStyles.cardTextBlue}>
            DynStav 的分析数据完全依赖同花顺动态板块的每日更新。<br/>
            为了获得准确的分析结果，建议您按照以下流程操作：
          </p>
          <div className={welcomeStyles.tutorialSteps}>
            <div className={welcomeStyles.tutorialStep}>
              <span className={welcomeStyles.tutorialNum}>1</span>
              <span>每日收盘后，打开同花顺并刷新动态板块数据</span>
            </div>
            <div className={welcomeStyles.tutorialStep}>
              <span className={welcomeStyles.tutorialNum}>2</span>
              <span>打开 DynStav，点击同步按钮导入当日数据</span>
            </div>
            <div className={welcomeStyles.tutorialStep}>
              <span className={welcomeStyles.tutorialNum}>3</span>
              <span>数据同步完成后即可查看最新的趋势分析</span>
            </div>
          </div>
          <p className={welcomeStyles.cardTextBlue}>
            收盘后同步可确保数据的准确性，使趋势分析真实反映市场变化，<br/>
            从而发挥 DynStav 的最大使用价值。
          </p>
          <p className={welcomeStyles.cardTextBlue}>
            首次同步后仅显示当天的数据，暂时无法观察变化趋势。<br/>
            连续使用多天、每日坚持同步后，趋势图表才会逐渐呈现出<br/>
            完整的走势变化，届时分析结果才更具参考价值。
          </p>
        </div>
      </div>
    </>
  )
}
