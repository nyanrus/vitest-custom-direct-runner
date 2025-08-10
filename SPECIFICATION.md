# 실용적인 Vitest v4 브라우저-DevConsole 테스트 환경 구축 가이드

## 목적 및 배경

기존 Vitest `browser` 모드나 Playwright 기반 테스트 환경 대신, **실제 브라우저의 Dev Console에서 Vite에 의해 컴파일된 JavaScript 모듈을 직접 import하여 테스트를 실행하는 환경**을 구축합니다.  
이 방식은 Playwright나 Puppeteer 같은 외부 제어 툴 없이도, Vite Dev Server의 모듈 변환 결과를 그대로 브라우저에서 실행할 수 있습니다.  
즉, 개발 중에 **브라우저에서 즉시 테스트 가능**, 코드 수정 후 Dev Console에서 재실행이 가능하며, JSDOM으로는 불가능한 WebGL, Canvas, Media API 등 브라우저 전용 기능을 테스트할 수 있습니다.

### 해결하고자 하는 문제들
1. JSDOM에서 지원하지 않는 브라우저 전용 API 테스트
2. 실제 브라우저 렌더링 및 상호작용 테스트
3. 번들/트랜스폼된 Vite 모듈의 실행 결과를 그대로 검증
4. Playwright 같은 외부 브라우저 자동화 도구 없이 테스트 실행
5. Dev Console에서 즉시 실행 가능하여 디버깅 효율 향상

---

## 아키텍처 설계

**핵심 아이디어**  
- `vite dev` 서버에서 테스트 파일도 함께 ESM으로 제공
- 브라우저 Dev Console에서 `await import('/tests/example.test.ts')` 형태로 로드
- 브라우저 환경에 맞춘 최소 테스트 러너(`runTests`) 작성
- 원한다면 CI에서 Playwright로 이 브라우저 테스트를 자동 실행 가능

---

## 아키텍처 설계

### 1. 기본 Vitest 설정

```typescript
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
```

### 2. 브라우저 환경 구현

```typescript
// src/test-utils/browser-environment.ts
import { DevEnvironment, type DevEnvironmentContext, type ResolvedConfig } from 'vite'
import { BrowserCommunicationChannel } from './browser-communication.js'

export function createBrowserDevEnvironment(
  name: string,
  config: ResolvedConfig,
  context: DevEnvironmentContext,
  options: { browser: 'chrome' | 'firefox' | 'webkit' }
) {
  const communicationChannel = new BrowserCommunicationChannel(options.browser)
  
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

// src/test-utils/browser-communication.ts
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
```

### 3. 테스트 러너 구현

```typescript
// src/test-utils/browser-runner.ts
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

export class BrowserTestRunner extends VitestTestRunner implements VitestRunner {
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
```

### 4. 브라우저 실행 관리자

```typescript
// src/test-utils/browser-executor.ts
import { ModuleRunner, ESModulesEvaluator } from 'vite/module-runner'
import type { ModuleRunnerTransport } from 'vite/module-runner'
import { chromium, firefox, webkit } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'

export class BrowserExecutor {
  private browsers = new Map<string, Browser>()
  private contexts = new Map<string, BrowserContext>()
  private runners = new Map<string, ModuleRunner>()
  private currentBrowser = 'chrome'
  
  constructor(private config: any) {}
  
  async initialize() {
    const browserConfigs = [
      { name: 'chrome', launcher: chromium },
      { name: 'firefox', launcher: firefox }
    ]
    
    for (const { name, launcher } of browserConfigs) {
      try {
        const browser = await launcher.launch({
          headless: process.env.CI === 'true',
          devtools: false
        })
        
        const context = await browser.newContext({
          viewport: { width: 1280, height: 720 }
        })
        
        this.browsers.set(name, browser)
        this.contexts.set(name, context)
        
        await this.setupModuleRunner(name, context)
        
        console.log(`Browser ${name} initialized successfully`)
      } catch (error) {
        console.warn(`Failed to initialize ${name}: ${error.message}`)
        // 해당 브라우저는 스킵하고 계속 진행
      }
    }
    
    if (this.browsers.size === 0) {
      throw new Error('No browsers could be initialized')
    }
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
              // 서버로 데이터 전송 로직
            }
          }
        })
        
        await page.exposeFunction('__testOnMessage', handlers.onMessage)
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
    // 테스트 파일들을 브라우저별로 분배
    const distribution = new Map<string, any[]>()
    const availableBrowsers = Array.from(this.browsers.keys())
    
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
    // 파일 경로 기반으로 브라우저 선택
    if (filepath.includes('.chrome.')) return 'chrome'
    if (filepath.includes('.firefox.')) return 'firefox'
    
    // 기본값 또는 라운드 로빈
    const browsers = Array.from(this.browsers.keys())
    if (browsers.length === 0) {
      throw new Error('No browsers available')
    }
    
    return browsers[0] // 단순화된 선택 로직
  }
  
  getBrowserForTest(test: any): string {
    return this.getBrowserForFile(test.file?.filepath || '')
  }
  
  getCurrentBrowser(): string {
    return this.currentBrowser
  }
  
  async takeScreenshot(selector?: string): Promise<string> {
    const context = this.contexts.get(this.currentBrowser)
    if (!context) throw new Error('No active browser context')
    
    try {
      const page = await context.newPage()
      if (selector) {
        const element = await page.locator(selector)
        return await element.screenshot({ encoding: 'base64' })
      } else {
        return await page.screenshot({ encoding: 'base64', fullPage: true })
      }
    } catch (error) {
      console.warn('Screenshot failed:', error.message)
      return ''
    }
  }
  
  async evaluateInBrowser(fn: Function): Promise<any> {
    const context = this.contexts.get(this.currentBrowser)
    if (!context) throw new Error('No active browser context')
    
    const page = await context.newPage()
    return await page.evaluate(fn)
  }
  
  async waitForElement(selector: string, timeout = 5000): Promise<void> {
    const context = this.contexts.get(this.currentBrowser)
    if (!context) throw new Error('No active browser context')
    
    const page = await context.newPage()
    try {
      await page.waitForSelector(selector, { timeout })
    } catch (error) {
      throw new Error(`Element '${selector}' not found within ${timeout}ms`)
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
    
    for (const browser of this.browsers.values()) {
      try {
        await browser.close()
      } catch (error) {
        console.warn('Browser cleanup warning:', error.message)
      }
    }
    
    this.browsers.clear()
    this.contexts.clear()
    this.runners.clear()
  }
}
```

## 실제 사용 예제

### 1. 기본 브라우저 테스트

```typescript
// src/tests/basic-browser.test.ts
import { describe, it, expect } from 'vitest'

describe('브라우저 기본 기능 테스트', () => {
  it('DOM 조작이 정상 작동해야 함', async ({ browser }) => {
    const result = await browser.evaluate(() => {
      const div = document.createElement('div')
      div.textContent = '테스트'
      document.body.appendChild(div)
      return document.querySelector('div')?.textContent
    })
    
    expect(result).toBe('테스트')
  })
  
  it('Fetch API를 사용할 수 있어야 함', async ({ browser }) => {
    const hasApiSupport = await browser.evaluate(() => {
      return typeof fetch !== 'undefined'
    })
    
    expect(hasApiSupport).toBe(true)
  })
})
```

### 2. 멀티 브라우저 테스트

```typescript
// src/tests/cross-browser.test.ts
import { describe, it, expect } from 'vitest'

describe('크로스 브라우저 호환성', () => {
  it('모든 브라우저에서 기본 기능 동작', async ({ browser }) => {
    const features = await browser.evaluate(() => ({
      hasLocalStorage: typeof localStorage !== 'undefined',
      hasSessionStorage: typeof sessionStorage !== 'undefined',
      hasWebGL: !!document.createElement('canvas').getContext('webgl'),
      userAgent: navigator.userAgent
    }))
    
    expect(features.hasLocalStorage).toBe(true)
    expect(features.hasSessionStorage).toBe(true)
    
    console.log(`브라우저: ${browser.name}`)
    console.log(`WebGL 지원: ${features.hasWebGL}`)
  })
})
```

### 3. 시각적 테스트

```typescript
// src/tests/visual.test.ts
import { describe, it, expect } from 'vitest'

describe('시각적 테스트', () => {
  it('버튼 렌더링이 올바른지 확인', async ({ browser }) => {
    await browser.evaluate(() => {
      const button = document.createElement('button')
      button.textContent = '클릭하세요'
      button.style.padding = '10px'
      button.style.backgroundColor = 'blue'
      button.style.color = 'white'
      document.body.appendChild(button)
    })
    
    // 버튼이 존재하는지 확인
    await browser.waitFor('button')
    
    // 스크린샷 촬영
    const screenshot = await browser.takeScreenshot('button')
    expect(screenshot).toBeTruthy()
  })
})
```

### 4. WebGL 테스트

```typescript
// src/tests/webgl.test.ts
import { describe, it, expect, beforeEach } from 'vitest'

describe('WebGL 테스트', () => {
  beforeEach(async ({ browser }) => {
    await browser.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 300
      canvas.id = 'webgl-canvas'
      document.body.appendChild(canvas)
    })
  })
  
  it('WebGL 컨텍스트를 생성할 수 있어야 함', async ({ browser }) => {
    const contextInfo = await browser.evaluate(() => {
      const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement
      const gl = canvas.getContext('webgl')
      
      if (!gl) return { supported: false }
      
      return {
        supported: true,
        version: gl.getParameter(gl.VERSION),
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER)
      }
    })
    
    expect(contextInfo.supported).toBe(true)
    
    if (contextInfo.supported) {
      console.log('WebGL 정보:', contextInfo)
    }
  })
  
  it('기본 셰이더를 컴파일할 수 있어야 함', async ({ browser }) => {
    const shaderResult = await browser.evaluate(() => {
      const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement
      const gl = canvas.getContext('webgl')
      
      if (!gl) return { success: false, error: 'WebGL not supported' }
      
      // 간단한 버텍스 셰이더
      const vertexShaderSource = `
        attribute vec4 position;
        void main() {
          gl_Position = position;
        }
      `
      
      const vertexShader = gl.createShader(gl.VERTEX_SHADER)
      if (!vertexShader) return { success: false, error: 'Failed to create shader' }
      
      gl.shaderSource(vertexShader, vertexShaderSource)
      gl.compileShader(vertexShader)
      
      const success = gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)
      const log = gl.getShaderInfoLog(vertexShader)
      
      return { success, error: success ? null : log }
    })
    
    expect(shaderResult.success).toBe(true)
    
    if (!shaderResult.success) {
      console.error('셰이더 컴파일 오류:', shaderResult.error)
    }
  })
})
```

## CI/CD 설정

### GitHub Actions 설정 예제

```yaml
# .github/workflows/browser-tests.yml
name: 브라우저 테스트

on: [push, pull_request]

jobs:
  browser-tests:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        browser: [chrome, firefox]
    
    steps:
      - name: 체크아웃
        uses: actions/checkout@v4
      
      - name: Node.js 설정
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: 의존성 설치
        run: npm ci
      
      - name: Playwright 브라우저 설치
        run: npx playwright install ${{ matrix.browser }} --with-deps
      
      - name: 브라우저 테스트 실행
        run: npm run test:browser
        env:
          CI: true
          BROWSER: ${{ matrix.browser }}
      
      - name: 테스트 결과 업로드
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results-${{ matrix.browser }}
          path: |
            test-results/
            screenshots/
```

### package.json 스크립트

```json
{
  "scripts": {
    "test": "vitest",
    "test:browser": "vitest --config vitest.config.ts",
    "test:browser:chrome": "BROWSER=chrome vitest --config vitest.config.ts",
    "test:browser:firefox": "BROWSER=firefox vitest --config vitest.config.ts",
    "test:watch": "vitest --watch"
  },
  "devDependencies": {
    "vitest": "^4.0.0",
    "playwright": "^1.40.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

## 주의사항 및 제한사항

### 성능 고려사항
- 브라우저 인스턴스 시작에 시간이 소요됩니다 (보통 1-3초)
- 메모리 사용량이 JSDOM보다 높습니다
- 병렬 실행 시 시스템 리소스를 많이 사용합니다

### 알려진 제한사항
- 일부 브라우저에서 특정 API가 제한될 수 있습니다
- 헤드리스 모드에서 일부 기능(예: 알림)이 동작하지 않을 수 있습니다
- 네트워크 상태에 따라 테스트 결과가 달라질 수 있습니다

### 권장사항
- 중요한 테스트는 여러 브라우저에서 실행해보세요
- 큰 테스트 스위트의 경우 병렬 실행을 제한하는 것이 좋습니다
- CI 환경에서는 타임아웃을 넉넉하게 설정하세요

## 문제 해결

### 일반적인 문제들

1. **브라우저 초기화 실패**
   ```bash
   # 브라우저 의존성 수동 설치
   npx playwright install-deps
   ```

2. **타임아웃 오류**
   ```typescript
   // vitest.config.ts에서 타임아웃 증가
   export default defineConfig({
     test: {
       testTimeout: 30000,
       hookTimeout: 10000
     }
   })
   ```

3. **메모리 부족**
   ```typescript
   // 브라우저 인스턴스 수 제한
   poolOptions: {
     threads: {
       maxThreads: 2
     }
   }
   ```

이 설정을 통해 실제 브라우저 환경에서 안정적이고 효과적인 테스트를 수행할 수 있습니다. 프로젝트의 요구사항에 맞게 설정을 조정하여 사용하시기 바랍니다.