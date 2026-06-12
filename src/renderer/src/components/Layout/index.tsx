import React, { ReactNode } from 'react'
import { ThemeType } from '../../types'
import styles from './styles.module.css'

interface LayoutProps {
  theme: ThemeType
  sidebarWidth: number
  rightPanelWidth: number
  onSidebarResize: (width: number) => void
  onRightPanelResize: (width: number) => void
  menuBar: ReactNode
  sidebar: ReactNode
  main: ReactNode
  rightPanel: ReactNode
  statusBar: ReactNode
}

export default function Layout({
  theme,
  sidebarWidth,
  rightPanelWidth,
  onSidebarResize,
  onRightPanelResize,
  menuBar,
  sidebar,
  main,
  rightPanel,
  statusBar
}: LayoutProps) {
  return (
    <div className={styles.layout} data-theme={theme}>
      <div className={styles.menuBar}>{menuBar}</div>
      <div className={styles.body}>
        <ResizablePanel
          direction="left"
          width={sidebarWidth}
          minWidth={200}
          maxWidth={500}
          onResize={onSidebarResize}
          collapsed={false}
        >
          <div className={styles.sidebar}>{sidebar}</div>
        </ResizablePanel>
        <div className={styles.main}>{main}</div>
        <ResizablePanel
          direction="right"
          width={rightPanelWidth}
          minWidth={0}
          maxWidth={400}
          onResize={onRightPanelResize}
          collapsed={rightPanelWidth === 0}
        >
          <div className={styles.rightPanel}>{rightPanel}</div>
        </ResizablePanel>
      </div>
      <div className={styles.statusBar}>{statusBar}</div>
    </div>
  )
}

interface ResizablePanelProps {
  direction: 'left' | 'right'
  width: number
  minWidth: number
  maxWidth: number
  onResize: (width: number) => void
  collapsed: boolean
  children: ReactNode
}

function ResizablePanel({
  direction,
  width,
  minWidth,
  maxWidth,
  onResize,
  collapsed,
  children
}: ResizablePanelProps) {
  const isLeft = direction === 'left'

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width

    function handleMouseMove(e: MouseEvent) {
      const delta = e.clientX - startX
      const newWidth = isLeft ? startWidth + delta : startWidth - delta
      onResize(Math.max(minWidth, Math.min(maxWidth, newWidth)))
    }

    function handleMouseUp() {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  if (collapsed) return null

  return (
    <div style={{ width, position: 'relative', flexShrink: 0 }}>
      {children}
      <div
        className={`${styles.resizer} ${isLeft ? styles.resizerRight : styles.resizerLeft}`}
        onMouseDown={handleMouseDown}
      />
    </div>
  )
}
