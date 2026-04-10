const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    env: {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      SESSION_SECRET: 'test-session-secret-very-long-string',
      NODE_ENV: 'test',
      PORT: '3000',
      GOOGLE_SHEETS_WEBHOOK: '', // отключаем Sheets в тестах
    },
  },
});
