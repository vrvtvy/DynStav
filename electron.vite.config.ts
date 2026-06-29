import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({
      exclude: ['ai', '@ai-sdk/openai', '@ai-sdk/anthropic', '@ai-sdk/google', 'zod']
    })],
    build: { sourcemap: true }
  },
  preload: {
    plugins: [externalizeDepsPlugin({
      exclude: ['ai', '@ai-sdk/openai', '@ai-sdk/anthropic', '@ai-sdk/google', 'zod']
    })],
    build: { sourcemap: true }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: { sourcemap: true }
  }
})
