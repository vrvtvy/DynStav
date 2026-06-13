import { useState, useEffect } from 'react'
import styles from './styles.module.css'

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.electronAPI.getWindowMaximized().then(setMaximized)
    const unsub = window.electronAPI.onMaximizeChanged(setMaximized)
    return unsub
  }, [])

  return (
    <div className={styles.titleBar}>
      <button className={styles.winBtn} onClick={() => window.electronAPI.minimizeWindow()} title="最小化">
        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
          <path d="M3 7.5C3 7.22386 3.22386 7 3.5 7H12.5C12.7761 7 13 7.22386 13 7.5C13 7.77614 12.7761 8 12.5 8H3.5C3.22386 8 3 7.77614 3 7.5Z"/>
        </svg>
      </button>
      <button className={styles.winBtn} onClick={() => window.electronAPI.maximizeWindow()} title={maximized ? '还原' : '最大化'}>
        {maximized ? (
          <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
            <path d="M5.08496 4C5.29088 3.4174 5.8465 3 6.49961 3H9.99961C11.6565 3 12.9996 4.34315 12.9996 6V9.5C12.9996 10.1531 12.5822 10.7087 11.9996 10.9146V6C11.9996 4.89543 11.1042 4 9.99961 4H5.08496ZM4.5 5H9.5C10.3284 5 11 5.67157 11 6.5V11.5C11 12.3284 10.3284 13 9.5 13H4.5C3.67157 13 3 12.3284 3 11.5V6.5C3 5.67157 3.67157 5 4.5 5ZM4.5 6C4.22386 6 4 6.22386 4 6.5V11.5C4 11.7761 4.22386 12 4.5 12H9.5C9.77614 12 10 11.7761 10 11.5V6.5C10 6.22386 9.77614 6 9.5 6H4.5Z"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
            <path d="M2 4.5C2 3.11929 3.11929 2 4.5 2H11.5C12.8807 2 14 3.11929 14 4.5V11.5C14 12.8807 12.8807 14 11.5 14H4.5C3.11929 14 2 12.8807 2 11.5V4.5ZM4.5 3C3.67157 3 3 3.67157 3 4.5V11.5C3 12.3284 3.67157 13 4.5 13H11.5C12.3284 13 13 12.3284 13 11.5V4.5C13 3.67157 12.3284 3 11.5 3H4.5Z"/>
          </svg>
        )}
      </button>
      <button className={`${styles.winBtn} ${styles.closeBtn}`} onClick={() => window.electronAPI.closeWindow()} title="关闭">
        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M7.11641 7.99992L2.55835 12.558L3.44223 13.4419L8.00029 8.88381L12.5583 13.4419L13.4422 12.558L8.88417 7.99992L13.4422 3.44187L12.5583 2.55798L8.00029 7.11604L3.44223 2.55798L2.55835 3.44187L7.11641 7.99992Z"/>
        </svg>
      </button>
    </div>
  )
}
