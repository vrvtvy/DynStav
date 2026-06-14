import ReactECharts from 'echarts-for-react'
import { useState, useMemo, useCallback } from 'react'
import { BlockDailyStats, BlockInfo } from '../../types'
import styles from './styles.module.css'

interface ChartViewProps {
  stats: BlockDailyStats[]
  selectedBlock: string
  blocks: BlockInfo[]
}

const METRICS = [
  { key: 'avgChangePercent', label: '平均涨跌幅', unit: '%', color: '#0077BB', type: 'line' as const },
  { key: 'stockCount', label: '股票数量', unit: '只', color: '#EE7733', type: 'line' as const },
  { key: 'avgPrice', label: '平均股价', unit: '元', color: '#009988', type: 'line' as const },
  { key: 'avgAmount', label: '平均成交额', unit: '亿', color: '#CC3311', type: 'line' as const },
  { key: 'totalAmount', label: '总成交额', unit: '亿', color: '#33BBEE', type: 'bar' as const },
  { key: 'avgTurnoverRate', label: '平均换手率', unit: '%', color: '#EE3377', type: 'line' as const }
]

const AXIS_GROUPS = [
  ['avgChangePercent', 'avgPrice'],
  ['avgAmount', 'avgTurnoverRate', 'stockCount'],
  ['totalAmount']
]

const AXIS_COLORS = ['#0077BB', '#CC3311', '#33BBEE']

function getAxisIndex(metricKey: string): number {
  return AXIS_GROUPS.findIndex(g => g.includes(metricKey))
}

export default function ChartView({ stats, selectedBlock, blocks }: ChartViewProps) {
  const [highlighted, setHighlighted] = useState('平均涨跌幅')
  const currentBlock = blocks.find(b => b.code === selectedBlock)

  const dates = useMemo(() => {
    const set = new Set(stats.map(s => s.date))
    return Array.from(set).sort()
  }, [stats])

  const option = useMemo(() => {
    if (!stats.length) return {}

    const series: any[] = []
    const hlMetric = METRICS.find(m => m.label === highlighted)

    METRICS.forEach((metric) => {
      const isHL = metric.label === highlighted
      const data = dates.map(date => {
        const item = stats.find(s => s.date === date)
        return item ? Number((item[metric.key] as number).toFixed(2)) : null
      })

      series.push({
        name: metric.label,
        type: metric.type,
        yAxisIndex: getAxisIndex(metric.key),
        data,
        smooth: metric.type === 'line',
        symbol: 'circle',
        symbolSize: isHL ? 8 : 4,
        lineStyle: {
          width: isHL ? 3 : 1,
          color: metric.color
        },
        itemStyle: {
          color: metric.color,
          opacity: isHL ? 1 : 0.35
        },
        barWidth: metric.type === 'bar' ? '40%' : undefined,
        areaStyle: isHL && metric.type === 'line' ? {
          color: metric.color,
          opacity: 0.1
        } : undefined,
        focus: 'self',
        emphasis: {
          lineStyle: { width: 4 },
          itemStyle: { opacity: 1 }
        }
      })
    })

    const hlAxisIdx = hlMetric ? getAxisIndex(hlMetric.key) : 0

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-color)',
        textStyle: { color: 'var(--text-primary)', fontSize: 12 },
        formatter: function (params: any) {
          let tip = `<strong>${params[0].axisValue}</strong><br/>`
          for (const p of params) {
            const m = METRICS.find(x => x.label === p.seriesName)
            if (p.value != null) {
              tip += `${p.marker} ${p.seriesName}: ${p.value}${m ? m.unit : ''}<br/>`
            }
          }
          return tip
        }
      },
      legend: {
        data: METRICS.map(m => ({
          name: m.label,
          textStyle: {
            color: m.label === highlighted ? m.color : 'var(--text-secondary)',
            fontWeight: m.label === highlighted ? 'bold' : 'normal',
            fontSize: m.label === highlighted ? 13 : 12
          }
        })),
        top: 5,
        textStyle: { color: 'var(--text-primary)', fontSize: 12 },
        selectedMode: false
      },
      grid: { left: 55, right: 105, top: 50, bottom: 30 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
        axisLabel: { color: 'var(--text-secondary)', fontSize: 11 }
      },
      yAxis: [
        {
          type: 'value',
          name: hlAxisIdx === 0 ? hlMetric?.label : '',
          nameTextStyle: { color: hlAxisIdx === 0 ? hlMetric?.color : AXIS_COLORS[0] },
          axisLine: { lineStyle: { color: AXIS_COLORS[0] } },
          axisLabel: { color: 'var(--text-secondary)', fontSize: 11 },
          splitLine: { lineStyle: { color: 'var(--border-light)', type: 'dashed' } }
        },
        {
          type: 'value',
          name: hlAxisIdx === 1 ? hlMetric?.label : '',
          nameTextStyle: { color: hlAxisIdx === 1 ? hlMetric?.color : AXIS_COLORS[1] },
          axisLine: { lineStyle: { color: AXIS_COLORS[1] } },
          axisLabel: { color: 'var(--text-secondary)', fontSize: 11 },
          splitLine: { show: false }
        },
        {
          type: 'value',
          name: '总成交额',
          nameTextStyle: { color: AXIS_COLORS[2] },
          position: 'right',
          offset: 55,
          axisLine: { lineStyle: { color: AXIS_COLORS[2] } },
          axisLabel: { color: 'var(--text-secondary)', fontSize: 11 },
          splitLine: { show: false }
        }
      ],
      series
    }
  }, [stats, dates, highlighted])

  const handleClick = useCallback((params: any) => {
    if (params.componentType === 'legend' && params.name) {
      setHighlighted(params.name)
    }
  }, [])

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
            option={option}
            style={{ height: '100%', width: '100%' }}
            onEvents={{
              click: handleClick
            }}
          />
        </div>
      ) : (
        <div className={styles.empty}>暂无数据，请先同步数据</div>
      )}
    </div>
  )
}
