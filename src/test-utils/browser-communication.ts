import type { HotChannel, HotPayload } from 'vite'
import { BrowserManager } from './browser-manager.js'

export class BrowserCommunicationChannel implements HotChannel {
  private browserManager: BrowserManager
  private listeners = new Map<string, Set<Function>>()

  constructor(browserType: string) {
    this.browserManager = new BrowserManager(browserType)
  }

  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
  }

  off(event: string, listener: Function): void {
    this.listeners.get(event)?.delete(listener)
  }

  send(payload: HotPayload): void {
    this.browserManager.sendMessage(payload).catch(error => {
      console.warn('Failed to send message to browser:', error.message)
    })
  }

  async handleInvoke(payload: HotPayload): Promise<any> {
    try {
      return await this.browserManager.invokeModule(payload)
    } catch (error) {
      console.error('Module invocation failed:', error)
      throw error
    }
  }
}
