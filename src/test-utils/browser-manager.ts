import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
  type BrowserType,
} from 'playwright'
import type { HotPayload } from 'vite'

class BrowserManagerSingleton {
  private browsers = new Map<string, Browser>()
  private contexts = new Map<string, BrowserContext>()
  private pages = new Map<string, Page>()

  private getLauncher(browserName: string): BrowserType {
    if (browserName === 'chrome') return chromium
    if (browserName === 'firefox') return firefox
    if (browserName === 'webkit') return webkit
    throw new Error(`Unsupported browser: ${browserName}`)
  }

  async getPage(browserName: string, viteServerUrl: string): Promise<Page> {
    if (this.pages.has(browserName)) {
      return this.pages.get(browserName)!
    }

    const context = await this.getContext(browserName);
    const page = await context.newPage()
    await page.goto(viteServerUrl);
    this.pages.set(browserName, page)
    return page
  }

  async getContext(browserName: string): Promise<BrowserContext> {
    if (this.contexts.has(browserName)) {
        return this.contexts.get(browserName)!;
    }

    let browser = this.browsers.get(browserName)
    if (!browser) {
      const launcher = this.getLauncher(browserName)
      browser = await launcher.launch({
        headless: process.env.CI === 'true',
        devtools: false,
      })
      this.browsers.set(browserName, browser)
    }

    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
    })
    this.contexts.set(browserName, context)

    return context;
  }

  async sendMessage(browserName: string, payload: HotPayload, viteServerUrl: string) {
    const page = await this.getPage(browserName, viteServerUrl)
    await page.evaluate((p) => {
      window.dispatchEvent(new MessageEvent('message', { data: p }))
    }, payload)
  }

  async invokeModule(browserName: string, payload: any, viteServerUrl: string): Promise<any> {
    const page = await this.getPage(browserName, viteServerUrl)
    return await page.evaluate(
      async (p) => {
        const response = await fetch('/__test_invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p),
        })
        if (!response.ok) {
            throw new Error(`Failed to invoke module: ${response.statusText}`);
        }
        return response.json()
      },
      payload,
    )
  }

  async cleanup() {
    for (const browser of this.browsers.values()) {
      await browser.close()
    }
    this.browsers.clear()
    this.contexts.clear()
    this.pages.clear()
  }
}

export const browserManagerSingleton = new BrowserManagerSingleton()

export class BrowserManager {
  constructor(private browserName: string, private viteServerUrl: string) {}

  sendMessage(payload: HotPayload) {
    return browserManagerSingleton.sendMessage(this.browserName, payload, this.viteServerUrl)
  }

  invokeModule(payload: any) {
    return browserManagerSingleton.invokeModule(this.browserName, payload, this.viteServerUrl)
  }
}
