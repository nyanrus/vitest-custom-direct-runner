import { DevEnvironment, type DevEnvironmentContext, type ResolvedConfig } from 'vite'
import { BrowserCommunicationChannel } from './browser-communication.js'

export function createBrowserDevEnvironment(
  name: string,
  config: ResolvedConfig,
  context: DevEnvironmentContext,
  options: { browser: 'chrome' | 'firefox' | 'webkit' }
) {
  const origin = config.server.origin ?? `http://${config.server.host}:${config.server.port}`
  const communicationChannel = new BrowserCommunicationChannel(options.browser, origin)

  const browserEnvironment = new DevEnvironment(name, config, {
    options: {
      resolve: {
        conditions: ['browser', 'module', 'import'],
        browserField: true
      },
      ...context.options,
    },
    hot: true,
    transport: communicationChannel,
  })

  return browserEnvironment
}
