// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { createBrowserDevEnvironment } from './src/test-utils/browser-environment.js'

export default defineConfig({
  test: {
    // 커스텀 러너 지정
    runner: './src/test-utils/browser-runner.js',
    // 환경별 설정
    environments: ['browser-chrome', 'browser-firefox'],
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 3,
        minThreads: 1,
      }
    }
  },
  environments: {
    'browser-chrome': {
      dev: {
        createEnvironment: (name, config, context) =>
          createBrowserDevEnvironment(name, config, context, { browser: 'chrome' })
      }
    },
    'browser-firefox': {
      dev: {
        createEnvironment: (name, config, context) =>
          createBrowserDevEnvironment(name, config, context, { browser: 'firefox' })
      }
    }
  }
})
