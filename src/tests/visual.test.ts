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
