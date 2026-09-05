const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: './tests',
    testMatch: '**/*.spec.cjs',
    timeout: 30000,
    workers: 1,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        viewport: { width: 1440, height: 1000 },
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
        trace: 'retain-on-failure'
    },
    webServer: { command: 'node tests/server.cjs', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI }
});
