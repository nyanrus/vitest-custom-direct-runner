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
