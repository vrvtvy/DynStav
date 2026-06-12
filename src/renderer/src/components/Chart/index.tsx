import ReactECharts from 'echarts-for-react'
import { useRef, useMemo } from 'react'
import { BlockDailyStats, BlockInfo, ChartMetric } from '../../types'
import styles from './styles.module.css'

interface ChartViewProps {
  stats: BlockDailyStats[]
  selectedBlock: string
  blocks: BlockInfo[]
}

const METRICS: ChartMetric[] = [
  { key: 'avgChangePercent', label: '平均涨跌幅', unit: '%', color: '#0077BB', type: 'line' },
  { key: 'stockCount', label: '股票数量', unit: '只', color: '#EE7733', type: 'line' },
  { key: 'avgPrice', label: '平均股价', unit: '元', color: '#009988', type: 'line' },
  { key: 'avgAmount', label: '平均成交额', unit: '亿', color: '#CC3311', type: 'line' },
  { key: 'totalAmount', label: '总成交额', unit: '亿', color: '#33BBEE', type: 'bar' },
  { key: 'avgTurnoverRate', label: '平均换手率', unit: '%', color: '#EE3377', type: 'line' }
]

export default function ChartView({ stats, selectedBlock, blocks }: ChartViewProps) {
  const chartRef = useRef<ReactECharts>(null)
  const currentBlock = blocks.find(b => b.code === selectedBlock)

  const dates = useMemo(() => [...new Set(stats.map(s => s.date))].sort(), [stats])

  const option = useMemo(() => {
    if (!stats.length) return {}

    const defaultMetric = 'avgChangePercent'
    const series: any[] = []
    const legendData: string[] = []

    METRICS.forEach((metric, idx) => {
      legendData.push(metric.label)
      const data = dates.map(date => {
        const item = stats.find(s => s.date === date)
        return item ? Number((item[metric.key] as number).toFixed(2)) : null
      })

      series.push({
        name: metric.label,
        type: metric.type,
        yAxisIndex: idx < 3 ? 0 : 1,
        data,
        smooth: metric.type === 'line',
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: metric.label === defaultMetric ? 3 : 1.5
        },
        itemStyle: {
          color: metric.color
        },
        emphasis: {
          lineStyle: {
            width: 4
          }
        },
        // 默认高亮first metric
        ...(metric.label !== defaultMetric ? { opacity: 0.6 } : {})
      })
    })

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-color)',
        textStyle: { color: 'var(--text-primary)', fontSize: 12 },
        formatter: function (params: any) {
          let tip = `<strong>${params[0].axisValue}</strong><br/>`
          params.forEach((p: any) => {
            const metric = METRICS.find(m => m.label === p.seriesName)
            tip += `${p.marker} ${p.seriesName}: ${p.value}${metric ? metric.unit : ''}<br/>`
          })
          return tip
        }
      },
      legend: {
        data: legendData,
        top: 5,
        textStyle: { color: 'var(--text-primary)', fontSize: 12 },
        selectedMode: true,
        // 点击图例控制高亮
      },
      grid: [
        { left: '6%', right: '6%', top: 50, bottom: 30 },
        { left: '6%', right: '6%', top: 50, bottom: 30 }
      ],
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
        axisLabel: { color: 'var(--text-secondary)', fontSize: 11 }
      },
      yAxis: [
        {
          type: 'value',
          name: '',
          axisLine: { lineStyle: { color: '#0077BB' } },
          axisLabel: { color: 'var(--text-secondary)', fontSize: 11 },
          splitLine: { lineStyle: { color: 'var(--border-light)', type: 'dashed' } }
        },
        {
          type: 'value',
          name: '',
          axisLine: { lineStyle: { color: '#CC3311' } },
          axisLabel: { color: 'var(--text-secondary)', fontSize: 11 },
          splitLine: { show: false }
        }
      ],
      series
    }
  }, [stats, dates])

  function handleChartClick(params: any) {
    // 点击图例切换高亮
    if (params.componentType === 'legend' || params.componentType === 'series') {
      const metric = METRICS.find(m => m.label === params.name || m.label === params.seriesName)
      if (!metric) return

      const instance = chartRef.current?.getEchartsInstance()
      if (!instance) return

      METRICS.forEach(m => {
        instance.dispatchAction({
          type: m.label === metric.label ? 'emphasis' : 'downplay',
          seriesName: m.label
        })
      })
    }
  }

  const blockName = currentBlock?.name || selectedBlock || '无数据'

  return (
    <div className={styles.chartView}>
      <div className={styles.header}>
        <h2 className={styles.title}>{blockName}</h2>
        {dates.length > 0 && (
          <span className={styles.dateRange}>
            {dates[0]} ~ {dates[dates.length - 1]}
          </span>
        )}
      </div>
      {stats.length > 0 ? (
        <div className={styles.chartContainer}>
          <ReactECharts
            ref={chartRef}
            option={option}
            style={{ height: '100%', width: '100%' }}
            onEvents={{
              click: handleChartClick,
              legendselectchanged: handleChartClick
            }}
          />
        </div>
      ) : (
        <div className={styles.empty}>
          暂无数据，请先同步数据
        </div>
      )}
    </div>
  )
}
