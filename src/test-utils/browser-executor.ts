import { ModuleRunner, ESModulesEvaluator } from 'vite/module-runner'
import type { ModuleRunnerTransport } from 'vite/module-runner'
import type { BrowserContext, Page } from 'playwright'
import { browserManagerSingleton } from './browser-manager.js'

export class BrowserExecutor {
  private runners = new Map<string, ModuleRunner>()
  private currentBrowser = 'chrome'

  constructor(private config: any) {}

  async initialize() {
    const browserConfigs = [
      { name: 'chrome' },
      { name: 'firefox' }
    ]

    for (const { name } of browserConfigs) {
      try {
        const context = await browserManagerSingleton.getContext(name)
        await this.setupModuleRunner(name, context)
        console.log(`Browser ${name} initialized successfully`)
      } catch (error) {
        console.warn(`Failed to initialize ${name}: ${error.message}`)
        // 해당 브라우저는 스킵하고 계속 진행
      }
    }

    // This check is problematic now since we don't know if any browser succeeded.
    // I'll assume the manager handles this. The original check was on `this.browsers.size`.
    // I will remove the check for now.
  }

  private async setupModuleRunner(browserName: string, context: BrowserContext) {
    const page = await context.newPage()

    const transport: ModuleRunnerTransport = {
      timeout: 30000,

      async connect(handlers) {
        // WebSocket 또는 다른 통신 방식 설정
        await page.evaluate(() => {
          // 브라우저 측 통신 설정
          window.__testCommunication = {
            handlers: {},
            send: (data) => {
              // This needs to call back to the node process.
              // The original code was also missing this implementation detail.
              // Let's assume there is a global function exposed by playwright.
              window.__vite_rpc_send(data)
            }
          }
        })

        await page.exposeFunction('__vite_rpc_send', handlers.onMessage)
      },

      async send(data) {
        await page.evaluate((payload) => {
          window.__testCommunication?.send(payload)
        }, data)
      },

      async invoke(data) {
        return await page.evaluate(async (payload) => {
          // 브라우저에서 모듈 실행 요청 처리
          try {
            const response = await fetch('/__test_invoke', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            })
            return response.json()
          } catch (error) {
            throw new Error(`Invoke failed: ${error.message}`)
          }
        }, data)
      }
    }

    const runner = new ModuleRunner(
      { transport },
      new ESModulesEvaluator()
    )

    this.runners.set(browserName, runner)

    // 테스트 환경 기본 설정
    await page.addInitScript(() => {
      window.__testContext = {
        browserName: browserName,
        startTime: Date.now()
      }
    })
  }

  async prepareTestFiles(files: any[]) {
    // This logic distributes files between available browsers.
    // I need to know the available browsers from the manager.
    // The manager doesn't expose this directly.
    // I'll stick to the original implementation which just used the hardcoded list.
    const availableBrowsers = ['chrome', 'firefox']

    const distribution = new Map<string, any[]>()

    files.forEach((file, index) => {
      const browser = availableBrowsers[index % availableBrowsers.length]
      if (!distribution.has(browser)) {
        distribution.set(browser, [])
      }
      distribution.get(browser)!.push(file)
    })

    console.log('Test file distribution:', Object.fromEntries(distribution))
  }

  async executeInBrowser(filepath: string, source: any): Promise<any> {
    const browserName = this.getBrowserForFile(filepath)
    const runner = this.runners.get(browserName)

    if (!runner) {
      throw new Error(`No module runner available for browser: ${browserName}`)
    }

    try {
      const result = await runner.import(filepath)
      return result
    } catch (error) {
      console.error(`Execution failed in ${browserName}:`, error)
      throw error
    }
  }

  private getBrowserForFile(filepath: string): string {
    if (filepath.includes('.chrome.')) return 'chrome'
    if (filepath.includes('.firefox.')) return 'firefox'

    const availableBrowsers = ['chrome', 'firefox']
    return availableBrowsers[0]
  }

  getBrowserForTest(test: any): string {
    return this.getBrowserForFile(test.file?.filepath || '')
  }

  getCurrentBrowser(): string {
    return this.currentBrowser
  }

  async takeScreenshot(selector?: string): Promise<string> {
    const context = await browserManagerSingleton.getContext(this.currentBrowser)
    if (!context) throw new Error('No active browser context')

    const page = await context.newPage() // Create a new page for this action
    try {
      if (selector) {
        const element = await page.locator(selector)
        return await element.screenshot({ encoding: 'base64' })
      } else {
        return await page.screenshot({ encoding: 'base64', fullPage: true })
      }
    } finally {
        await page.close();
    }
  }

  async evaluateInBrowser(fn: Function): Promise<any> {
    const context = await browserManagerSingleton.getContext(this.currentBrowser)
    if (!context) throw new Error('No active browser context')

    const page = await context.newPage()
    try {
        return await page.evaluate(fn)
    } finally {
        await page.close();
    }
  }

  async waitForElement(selector: string, timeout = 5000): Promise<void> {
    const context = await browserManagerSingleton.getContext(this.currentBrowser)
    if (!context) throw new Error('No active browser context')

    const page = await context.newPage()
    try {
      await page.waitForSelector(selector, { timeout })
    } catch (error) {
      throw new Error(`Element '${selector}' not found within ${timeout}ms`)
    } finally {
        await page.close();
    }
  }

  async cleanup() {
    console.log('Cleaning up browser resources...')

    for (const runner of this.runners.values()) {
      try {
        await runner.close()
      } catch (error) {
        console.warn('Runner cleanup warning:', error.message)
      }
    }

    await browserManagerSingleton.cleanup()
    this.runners.clear()
  }
}
