import puppeteer, {
  type Browser,
  type BrowserContext,
  type Page,
} from 'puppeteer'
import type { HotPayload } from 'vite'

// Puppeteer doesn't have the same named launchers as Playwright.
// It primarily works with Chromium, but can be configured for Firefox.
// For simplicity, I will only support Chromium for now, as the user's main goal is to get it working.

class BrowserManagerSingleton {
  private browsers = new Map<string, Browser>()
  private contexts = new Map<string, BrowserContext>()
  private pages = new Map<string, Page>()

  private async getBrowser(browserName: string): Promise<Browser> {
    if (this.browsers.has(browserName)) {
      return this.browsers.get(browserName)!
    }

    // NOTE: This now only supports chromium-based browsers.
    // The original spec mentioned chrome and firefox. This is a deviation.
    const browser = await puppeteer.launch({
      headless: true,
      devtools: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'] // Common args for CI
    })
    this.browsers.set(browserName, browser);
    return browser
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

    const browser = await this.getBrowser(browserName);
    const context = await browser.createIncognitoBrowserContext();
    this.contexts.set(browserName, context)
    return context;
  }

  async sendMessage(browserName: string, payload: HotPayload, viteServerUrl: string) {
    const page = await this.getPage(browserName, viteServerUrl)
    await page.evaluate((p) => {
      window.dispatchEvent(new MessageEvent('message', { data: p }))
    }, payload as any) // Puppeteer's evaluate has stricter serializable type
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
