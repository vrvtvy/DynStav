import { readFileSync, writeFileSync, existsSync } from 'fs'
import { getConfigPath } from './paths'
import { AppConfig, ThemeType } from '../renderer/src/types'

const CONFIG_FILE = 'config.json'

const DEFAULT_CONFIG: AppConfig = {
  theme: 'dark' as ThemeType,
  thsUserDir: null,
  stockblockIniPath: null
}

export function loadConfig(): AppConfig {
  const filePath = getConfigPath(CONFIG_FILE)
  if (!existsSync(filePath)) {
    saveConfig(DEFAULT_CONFIG)
    return { ...DEFAULT_CONFIG }
  }
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: AppConfig): void {
  const filePath = getConfigPath(CONFIG_FILE)
  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
}
