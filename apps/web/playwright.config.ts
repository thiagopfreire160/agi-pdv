import { defineConfig } from '@playwright/test'

// Usa o Chrome do sistema quando o Chromium do Playwright não estiver instalado.
const executavel = process.env.CHROME_PATH || (process.env.PW_CHROMIUM ? undefined : '/usr/bin/google-chrome')

export default defineConfig({
  testDir: './testes',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    launchOptions: executavel ? { executablePath: executavel } : {},
    trace: 'retain-on-failure',
  },
})
