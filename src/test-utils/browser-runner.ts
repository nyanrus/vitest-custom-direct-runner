import type {
  VitestRunner,
  VitestRunnerConfig,
  File,
  TaskPopulated,
  TestContext,
  VitestRunnerImportSource
} from 'vitest/suite'
import { VitestTestRunner } from 'vitest/runners'
import { BrowserExecutor } from './browser-executor.js'

export default class BrowserTestRunner extends VitestTestRunner implements VitestRunner {
  public config: VitestRunnerConfig
  private executor: BrowserExecutor
  private testResults = new Map<string, any>()

  constructor(config: VitestRunnerConfig) {
    super(config)
    this.config = config
    this.executor = new BrowserExecutor(config)
  }

  async onBeforeCollect(paths: string[]) {
    console.log(`Starting test collection for ${paths.length} files`)
    try {
      await this.executor.initialize()
    } catch (error) {
      console.error('Failed to initialize browser executor:', error)
      throw error
    }
  }

  async onCollected(files: File[]) {
    console.log(`Collected ${files.length} test files`)
    await this.executor.prepareTestFiles(files)
  }

  async onBeforeRunTask(test: TaskPopulated) {
    const browserType = this.executor.getBrowserForTest(test)
    console.log(`Running "${test.name}" in ${browserType}`)
  }

  async onAfterRunTask(test: TaskPopulated) {
    this.testResults.set(test.id, {
      name: test.name,
      result: test.result,
      browser: this.executor.getBrowserForTest(test),
      timestamp: Date.now()
    })
  }

  async importFile(filepath: string, source: VitestRunnerImportSource) {
    try {
      const result = await this.executor.executeInBrowser(filepath, source)
      return result
    } catch (error) {
      console.error(`Failed to import ${filepath}:`, error)
      throw error
    }
  }

  extendTaskContext(context: TestContext): TestContext {
    return {
      ...context,
      browser: {
        name: this.executor.getCurrentBrowser(),
        takeScreenshot: async (selector?: string) =>
          this.executor.takeScreenshot(selector),
        evaluate: async (fn: Function) =>
          this.executor.evaluateInBrowser(fn),
        waitFor: async (selector: string, timeout = 5000) =>
          this.executor.waitForElement(selector, timeout)
      }
    }
  }

  async onAfterRunFiles(files: File[]) {
    const summary = this.generateSummary()
    console.log('Test execution completed:', summary)

    try {
      await this.executor.cleanup()
    } catch (error) {
      console.warn('Cleanup warning:', error.message)
    }
  }

  private generateSummary() {
    const results = Array.from(this.testResults.values())
    const stats = {
      total: results.length,
      passed: results.filter(r => r.result?.state === 'pass').length,
      failed: results.filter(r => r.result?.state === 'fail').length
    }

    return stats
  }
}
