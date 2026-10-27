/// <reference lib="webworker" />

const VERTEX = `#version 300 es
in vec2 p;
void main() {
  gl_Position = vec4(p, 0.0, 1.0);
}`

// Draws the whole NV12 image into one single-channel target, W wide and 1.5 H tall: the luma plane
// in the first H rows, then the chroma rows, where even columns hold U and odd ones V of a 2x2 block.
// readPixels returns rows bottom-up, so target row r is output row r and maps to source row r.
// BT.709, limited range.
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform int height;
out vec4 o;
float y709(vec3 c) { return (16.0 + 255.0 * dot(c, vec3(0.1826, 0.6142, 0.0620))) / 255.0; }
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  if (at.y < height) {
    o = vec4(y709(texelFetch(src, at, 0).rgb), 0.0, 0.0, 1.0);
    return;
  }
  ivec2 block = ivec2((at.x / 2) * 2, (at.y - height) * 2);
  vec3 c = (texelFetch(src, block, 0).rgb + texelFetch(src, block + ivec2(1, 0), 0).rgb +
            texelFetch(src, block + ivec2(0, 1), 0).rgb + texelFetch(src, block + ivec2(1, 1), 0).rgb) * 0.25;
  float chroma = (at.x % 2 == 0)
    ? 128.0 + 255.0 * dot(c, vec3(-0.1006, -0.3386, 0.4392))
    : 128.0 + 255.0 * dot(c, vec3(0.4392, -0.3989, -0.0403));
  o = vec4(chroma / 255.0, 0.0, 0.0, 1.0);
}`

/**
 * Converts frames of an OffscreenCanvas to NV12 on the GPU with WebGL2 and reads back only that
 * (1.5 bytes per pixel instead of 4 for RGBA) in a single readPixels.
 */
export function createNv12Converter(width: number, height: number): (source: OffscreenCanvas) => Uint8Array {
  const gl = new OffscreenCanvas(1, 1).getContext('webgl2', { antialias: false, depth: false, alpha: false })
  if (!gl) throw new Error('WebGL2 is not available for the GPU export')

  const program = gl.createProgram()!
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT]
  ] as const) {
    const s = gl.createShader(type)!
    gl.shaderSource(s, source)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error')
    gl.attachShader(program, s)
  }
  gl.bindAttribLocation(program, 0, 'p')
  gl.linkProgram(program)
  gl.useProgram(program)
  gl.uniform1i(gl.getUniformLocation(program, 'height'), height)

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const src = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, src)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

  const rows = height * 1.5
  const target = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, target)
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, width, rows)
  gl.bindFramebuffer(gl.FRAMEBUFFER, gl.createFramebuffer())
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0)
  gl.viewport(0, 0, width, rows)
  gl.pixelStorei(gl.PACK_ALIGNMENT, 1)
  gl.bindTexture(gl.TEXTURE_2D, src)

  return (source) => {
    const out = new Uint8Array(width * rows)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.readPixels(0, 0, width, rows, gl.RED, gl.UNSIGNED_BYTE, out)
    return out
  }
}
