// describe, it, expect are now globals provided by manual-harness.js

describe('WebGL 테스트', () => {
  const setupCanvas = () => {
      document.getElementById('webgl-canvas')?.remove();
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      canvas.id = 'webgl-canvas';
      document.body.appendChild(canvas);
      return canvas;
  };

  it('WebGL 컨텍스트를 생성할 수 있어야 함', async () => {
    const canvas = setupCanvas();
    const gl = canvas.getContext('webgl');
    const contextInfo = {
        supported: !!gl,
        version: gl ? gl.getParameter(gl.VERSION) : null,
        vendor: gl ? gl.getParameter(gl.VENDOR) : null,
        renderer: gl ? gl.getParameter(gl.RENDERER) : null,
    };

    expect(contextInfo.supported).toBe(true);

    if (contextInfo.supported) {
      console.log('WebGL 정보:', contextInfo);
    }
    // cleanup
    canvas.remove();
  });

  it('기본 셰이더를 컴파일할 수 있어야 함', async () => {
    const canvas = setupCanvas();
    const gl = canvas.getContext('webgl');
    if (!gl) {
        throw new Error('WebGL not supported');
    }

    const vertexShaderSource = `
        attribute vec4 position;
        void main() {
          gl_Position = position;
        }
    `;

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) throw new Error('Failed to create shader');

    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);

    const success = gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS);
    const log = gl.getShaderInfoLog(vertexShader);

    expect(success).toBe(true);
    if (!success) {
        console.error('셰이더 컴파일 오류:', log);
    }
    // cleanup
    canvas.remove();
  });
});
