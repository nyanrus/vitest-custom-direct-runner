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
