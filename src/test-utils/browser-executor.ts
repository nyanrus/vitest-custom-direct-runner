import { ModuleRunner, ESModulesEvaluator } from 'vite/module-runner'
import type { ModuleRunnerTransport } from 'vite/module-runner'
import type { BrowserContext, Page } from 'playwright'
import { browserManagerSingleton } from './browser-manager.js'

export class BrowserExecutor {
  private runners = new Map<string, ModuleRunner>()
  private initializedBrowsers: string[] = []
  private currentBrowser = 'chrome'

  constructor(private config: any) {}

  async initialize() {
    const allBrowserConfigs = [
      { name: 'chrome' },
      { name: 'firefox' }
    ]

    const targetBrowser = process.env.BROWSER
    const browserConfigsToLaunch = targetBrowser
      ? allBrowserConfigs.filter(b => b.name === targetBrowser)
      : allBrowserConfigs;

    for (const { name } of browserConfigsToLaunch) {
      try {
        const context = await browserManagerSingleton.getContext(name)
        await this.setupModuleRunner(name, context)
        this.initializedBrowsers.push(name)
        console.log(`Browser ${name} initialized successfully`)
      } catch (error) {
        console.warn(`Failed to initialize ${name}: ${(error as Error).message}`)
      }
    }

    if (this.initializedBrowsers.length === 0) {
      throw new Error('No browsers could be initialized')
    }

    this.currentBrowser = this.initializedBrowsers[0];
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
            throw new Error(`Invoke failed: ${(error as Error).message}`)
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
    const availableBrowsers = this.initializedBrowsers

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

    const availableBrowsers = this.initializedBrowsers
    if (availableBrowsers.length === 0) {
      throw new Error('No browsers available')
    }

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
        console.warn('Runner cleanup warning:', (error as Error).message)
      }
    }

    await browserManagerSingleton.cleanup()
    this.runners.clear()
  }
}
