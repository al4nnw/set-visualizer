/// <reference lib="webworker" />

const VERTEX = `#version 300 es
in vec2 p;
out vec2 uv;
void main() {
  // readPixels returns rows bottom-up, so sample the source bottom-up too.
  uv = vec2(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`

// BT.709, limited range.
const LUMA = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D src;
out vec4 o;
void main() {
  vec3 c = texture(src, uv).rgb;
  o = vec4((16.0 + 255.0 * dot(c, vec3(0.1826, 0.6142, 0.0620))) / 255.0, 0.0, 0.0, 1.0);
}`

// Rendered at half size: linear filtering averages each 2x2 block of the source.
const CHROMA = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D src;
out vec4 o;
void main() {
  vec3 c = texture(src, uv).rgb;
  float u = (128.0 + 255.0 * dot(c, vec3(-0.1006, -0.3386, 0.4392))) / 255.0;
  float v = (128.0 + 255.0 * dot(c, vec3(0.4392, -0.3989, -0.0403))) / 255.0;
  o = vec4(u, v, 0.0, 1.0);
}`

/**
 * Converts frames of an OffscreenCanvas to NV12 on the GPU with WebGL2 and reads back only that
 * (1.5 bytes per pixel instead of 4 for RGBA), which is what makes the GPU export fast at 4K.
 */
export function createNv12Converter(width: number, height: number): (source: OffscreenCanvas) => Uint8Array {
  const gl = new OffscreenCanvas(width, height).getContext('webgl2', { antialias: false, depth: false, alpha: false })
  if (!gl) throw new Error('WebGL2 is not available for the GPU export')

  const program = (fragment: string) => {
    const p = gl.createProgram()!
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, fragment]
    ] as const) {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error')
      gl.attachShader(p, s)
    }
    gl.bindAttribLocation(p, 0, 'p')
    gl.linkProgram(p)
    return p
  }
  const luma = program(LUMA)
  const chroma = program(CHROMA)

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const src = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, src)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const target = (format: number, w: number, h: number) => {
    const t = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, w, h)
    const fb = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
    return fb
  }
  const lumaFb = target(gl.R8, width, height)
  const chromaFb = target(gl.RG8, width / 2, height / 2)
  gl.pixelStorei(gl.PACK_ALIGNMENT, 1)

  return (source) => {
    const out = new Uint8Array(width * height * 1.5)
    gl.bindTexture(gl.TEXTURE_2D, src)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.bindFramebuffer(gl.FRAMEBUFFER, lumaFb)
    gl.viewport(0, 0, width, height)
    gl.useProgram(luma)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.readPixels(0, 0, width, height, gl.RED, gl.UNSIGNED_BYTE, out.subarray(0, width * height))
    gl.bindFramebuffer(gl.FRAMEBUFFER, chromaFb)
    gl.viewport(0, 0, width / 2, height / 2)
    gl.useProgram(chroma)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.readPixels(0, 0, width / 2, height / 2, gl.RG, gl.UNSIGNED_BYTE, out.subarray(width * height))
    return out
  }
}
