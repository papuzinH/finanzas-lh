import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Los worktrees de sesiones de agente son copias del repo: sin esto,
    // vitest levanta sus tests viejos junto con los de src/ y reporta
    // fallos de código que ya no existe en esta rama.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/worktrees/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
