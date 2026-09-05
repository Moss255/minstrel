/**
 * Reference mode: render at the DS's own resolution and colour depth, then
 * scale that up for display.
 *
 * This is the validation tool. Comparing output against real hardware is only
 * meaningful at the size and precision the hardware works in — a 1080p render
 * with 8-bit colour hides exactly the differences worth catching. So the scene
 * is drawn into a 256x192 framebuffer, quantised to the DS's 5 bits per
 * channel, and blitted up with nearest-neighbour sampling so every hardware
 * pixel stays visible as a block.
 *
 * The scale is a whole number and the image is centred, so a hardware pixel is
 * always a square block of identical output pixels. Fractional scaling would
 * resample the very thing being validated.
 */

/** The DS's screen size, in pixels. One screen. */
export const DS_WIDTH = 256
export const DS_HEIGHT = 192

const VERTEX_SHADER = `#version 300 es
out vec2 vUv;
void main() {
  // A single triangle covering the viewport; no vertex buffer needed.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform bool uQuantise;
out vec4 outColor;
void main() {
  vec3 c = texture(uScene, vUv).rgb;
  if (uQuantise) {
    // The DS frame buffer holds 5 bits per channel. Quantising to 31 steps and
    // back is what makes banding show up here the way it does on hardware.
    c = floor(c * 31.0 + 0.5) / 31.0;
  }
  outColor = vec4(c, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`reference-mode shader failed to compile: ${log}`)
  }
  return shader
}

/** The rectangle a reference-mode image occupies within a canvas. */
export interface Placement {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** Whole-number magnification applied to each hardware pixel. */
  readonly scale: number
}

/** Largest whole-number scale of a DS screen that fits, centred. */
export function placement(canvasWidth: number, canvasHeight: number): Placement {
  const scale = Math.max(1, Math.floor(Math.min(canvasWidth / DS_WIDTH, canvasHeight / DS_HEIGHT)))
  const width = DS_WIDTH * scale
  const height = DS_HEIGHT * scale
  return {
    x: Math.floor((canvasWidth - width) / 2),
    y: Math.floor((canvasHeight - height) / 2),
    width,
    height,
    scale,
  }
}

/**
 * An off-screen 256x192 target and the pass that presents it.
 *
 * Draw the scene with {@link bind} active, then call {@link present} to blit it
 * to the canvas.
 */
export class ReferenceTarget {
  private readonly gl: WebGL2RenderingContext
  private readonly framebuffer: WebGLFramebuffer
  private readonly colour: WebGLTexture
  private readonly program: WebGLProgram
  private readonly vao: WebGLVertexArrayObject
  private readonly uQuantise: WebGLUniformLocation

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl

    const colour = gl.createTexture()
    // The depth buffer is attached once and never referenced again.
    const depth = gl.createRenderbuffer()
    const framebuffer = gl.createFramebuffer()
    const vao = gl.createVertexArray()
    if (!colour || !depth || !framebuffer || !vao) {
      throw new Error('could not allocate the reference-mode target')
    }
    this.colour = colour
    this.framebuffer = framebuffer
    this.vao = vao

    gl.bindTexture(gl.TEXTURE_2D, colour)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      DS_WIDTH,
      DS_HEIGHT,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )
    // Nearest sampling on the way out: a hardware pixel must stay a block.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    gl.bindRenderbuffer(gl.RENDERBUFFER, depth)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, DS_WIDTH, DS_HEIGHT)

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colour, 0)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth)
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`reference-mode framebuffer is incomplete: 0x${status.toString(16)}`)
    }

    const program = gl.createProgram()
    if (!program) throw new Error('could not create the reference-mode program')
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`reference-mode program failed to link: ${gl.getProgramInfoLog(program)}`)
    }
    this.program = program

    const uQuantise = gl.getUniformLocation(program, 'uQuantise')
    if (!uQuantise) throw new Error('reference-mode uniform missing')
    this.uQuantise = uQuantise
  }

  /** Direct drawing into the 256x192 target. */
  bind(): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    gl.viewport(0, 0, DS_WIDTH, DS_HEIGHT)
  }

  /** Blit the target to the canvas, magnified and centred. */
  present(canvasWidth: number, canvasHeight: number, quantise: boolean): Placement {
    const gl = this.gl
    const place = placement(canvasWidth, canvasHeight)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvasWidth, canvasHeight)
    gl.disable(gl.DEPTH_TEST)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.viewport(place.x, place.y, place.width, place.height)
    gl.useProgram(this.program)
    gl.uniform1i(this.uQuantise, quantise ? 1 : 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.colour)
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
    gl.enable(gl.DEPTH_TEST)

    return place
  }

  /** The DS screen's aspect ratio, for a caller framing a camera. */
  static get aspect(): number {
    return DS_WIDTH / DS_HEIGHT
  }
}
