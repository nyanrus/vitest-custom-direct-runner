import type { HotChannel, HotPayload } from 'vite'
import { BrowserManager } from './browser-manager.js'

export class BrowserCommunicationChannel implements HotChannel {
  private browserManager: BrowserManager
  private listeners = new Map<string, Set<Function>>()

  constructor(browserType: string, viteServerUrl: string) {
    this.browserManager = new BrowserManager(browserType, viteServerUrl)
  }

  on(event: string, listener: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
  }

  off(event: string, listener: (...args: any[]) => void): void {
    this.listeners.get(event)?.delete(listener)
  }

  // This method will be called by the Vite DevEnvironment when a message arrives
  // This is an assumption based on how event channels typically work.
  _onMessage(message: { type: 'custom'; event: string; data: any; }) {
    if (message.type === 'custom' && message.event) {
      this.emit(message.event, message.data);
    }
  }

  private emit(event: string, ...args: any[]) {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.forEach(listener => listener(...args));
    }
  }

  send(payload: HotPayload): void {
    // This is for automated runner HMR, not manual testing, but keep it.
    this.browserManager.sendMessage(payload).catch(error => {
      console.warn('Failed to send message to browser:', error.message)
    })
  }

  async handleInvoke(payload: HotPayload): Promise<any> {
    // This is for automated runner RPC, not manual testing, but keep it.
    try {
      return await this.browserManager.invokeModule(payload)
    } catch (error) {
      console.error('Module invocation failed:', error)
      throw error
    }
  }
}
