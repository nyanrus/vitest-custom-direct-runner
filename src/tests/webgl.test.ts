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
