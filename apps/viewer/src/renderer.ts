import type { Geometry } from '@vesper/nitro-gfx'
import { type FollowCamera, perspective, viewMatrix } from '@vesper/render'

/**
 * A minimal WebGL2 renderer for decoded model geometry.
 *
 * Deliberately plain: one draw call per shape, its texture bound, depth test.
 * The camera and the framing come from `@vesper/render`, so the viewer sees
 * what the game will see. DS toon shading, edge marking and the 5-bit colour pipeline
 * belong to the reference renderer and are not attempted here — the job of this
 * one is to prove the parsers put correct geometry and pixels on screen.
 */

const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aColor;
in vec2 aTexCoord;
uniform mat4 uModelViewProjection;
uniform vec2 uTextureSize;
out vec3 vColor;
out vec2 vTexCoord;
out vec3 vViewPosition;
void main() {
  vColor = aColor;
  // Texture coordinates arrive in texels, so scale by the texture's size.
  vTexCoord = uTextureSize.x > 0.0 ? aTexCoord / uTextureSize : vec2(0.0);
  vec4 clip = uModelViewProjection * vec4(aPosition, 1.0);
  vViewPosition = clip.xyz;
  gl_Position = clip;
}`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vColor;
in vec2 vTexCoord;
in vec3 vViewPosition;
uniform sampler2D uTexture;
uniform bool uHasTexture;
uniform bool uWireframe;
out vec4 outColor;
void main() {
  if (uWireframe) { outColor = vec4(vColor * 0.5 + 0.5, 1.0); return; }
  vec4 base = vec4(vColor, 1.0);
  if (uHasTexture) {
    vec4 texel = texture(uTexture, vTexCoord);
    if (texel.a < 0.05) discard;
    base = vec4(base.rgb * texel.rgb, texel.a);
  } else {
    // Cheap face lighting from screen-space derivatives, so untextured
    // geometry still reads as solid. Not a DS lighting model; a viewing aid.
    vec3 normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    base.rgb *= 0.55 + 0.45 * abs(normal.z);
  }
  outColor = base;
}`

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`shader failed to compile: ${log}`)
  }
  return shader
}

/** The camera the renderer draws from; see `@vesper/render`. */
export type Camera = FollowCamera

/** One shape, with the texture it is drawn with. */
export interface Piece {
  readonly geometry: Geometry
  /** Straight RGBA, four bytes per pixel, or undefined for untextured. */
  readonly pixels?: Uint8Array
  readonly width?: number
  readonly height?: number
}

interface Batch {
  readonly first: number
  readonly count: number
  readonly texture: WebGLTexture | null
  readonly width: number
  readonly height: number
}

function multiply(a: Float32Array, b: Float32Array, out: Float32Array): Float32Array {
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] as number) * (b[col * 4 + k] as number)
      out[col * 4 + row] = sum
    }
  }
  return out
}

export class ModelRenderer {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly vao: WebGLVertexArrayObject
  private readonly positionBuffer: WebGLBuffer
  private readonly colorBuffer: WebGLBuffer
  private readonly texCoordBuffer: WebGLBuffer
  private readonly indexBuffer: WebGLBuffer
  private readonly uMvp: WebGLUniformLocation
  private readonly uWireframe: WebGLUniformLocation
  private readonly uHasTexture: WebGLUniformLocation
  private readonly uTextureSize: WebGLUniformLocation
  private batches: Batch[] = []
  private owned: WebGLTexture[] = []

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false })
    if (!gl) throw new Error('WebGL2 is not available in this browser')
    this.gl = gl

    const program = gl.createProgram()
    if (!program) throw new Error('could not create program')
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
    gl.bindAttribLocation(program, 0, 'aPosition')
    gl.bindAttribLocation(program, 1, 'aColor')
    gl.bindAttribLocation(program, 2, 'aTexCoord')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program failed to link: ${gl.getProgramInfoLog(program)}`)
    }
    this.program = program

    const uMvp = gl.getUniformLocation(program, 'uModelViewProjection')
    const uWireframe = gl.getUniformLocation(program, 'uWireframe')
    const uHasTexture = gl.getUniformLocation(program, 'uHasTexture')
    const uTextureSize = gl.getUniformLocation(program, 'uTextureSize')
    if (!uMvp || !uWireframe || !uHasTexture || !uTextureSize) {
      throw new Error('shader uniforms missing')
    }
    this.uMvp = uMvp
    this.uWireframe = uWireframe
    this.uHasTexture = uHasTexture
    this.uTextureSize = uTextureSize

    const vao = gl.createVertexArray()
    const positionBuffer = gl.createBuffer()
    const colorBuffer = gl.createBuffer()
    const texCoordBuffer = gl.createBuffer()
    const indexBuffer = gl.createBuffer()
    if (!vao || !positionBuffer || !colorBuffer || !texCoordBuffer || !indexBuffer) {
      throw new Error('could not allocate GPU buffers')
    }
    this.vao = vao
    this.positionBuffer = positionBuffer
    this.colorBuffer = colorBuffer
    this.texCoordBuffer = texCoordBuffer
    this.indexBuffer = indexBuffer

    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
    gl.bindVertexArray(null)

    gl.enable(gl.DEPTH_TEST)
    gl.clearColor(0.078, 0.086, 0.102, 1)
  }

  /** Upload the model as one buffer with a draw range and texture per shape. */
  upload(pieces: readonly Piece[]): { vertices: number; triangles: number; textured: number } {
    const gl = this.gl
    for (const texture of this.owned) gl.deleteTexture(texture)
    this.owned = []
    this.batches = []

    const total = pieces.reduce((n, p) => n + p.geometry.vertices.length, 0)
    const positions = new Float32Array(total * 3)
    const colors = new Float32Array(total * 3)
    const texCoords = new Float32Array(total * 2)
    const indices: number[] = []

    let base = 0
    let textured = 0
    for (const piece of pieces) {
      piece.geometry.vertices.forEach((v, i) => {
        const at = (base + i) * 3
        positions[at] = v.x
        positions[at + 1] = v.y
        positions[at + 2] = v.z
        colors[at] = v.r
        colors[at + 1] = v.g
        colors[at + 2] = v.b
        texCoords[(base + i) * 2] = v.s
        texCoords[(base + i) * 2 + 1] = v.t
      })

      const first = indices.length
      for (const index of piece.geometry.indices) indices.push(base + index)
      base += piece.geometry.vertices.length

      let texture: WebGLTexture | null = null
      if (piece.pixels && piece.width && piece.height) {
        texture = gl.createTexture()
        if (texture) {
          textured++
          this.owned.push(texture)
          gl.bindTexture(gl.TEXTURE_2D, texture)
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            piece.width,
            piece.height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            piece.pixels,
          )
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
        }
      }
      this.batches.push({
        first,
        count: indices.length - first,
        texture,
        width: piece.width ?? 0,
        height: piece.height ?? 0,
      })
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW)

    return { vertices: total, triangles: indices.length / 3, textured }
  }

  /** The context, so a caller can build its own render targets against it. */
  get context(): WebGL2RenderingContext {
    return this.gl
  }

  /**
   * Draw the scene.
   *
   * `viewport` overrides the size drawn at and the aspect the camera is framed
   * for; reference mode passes the DS's 256x192 so the projection matches what
   * the hardware would produce, rather than being a letterboxed crop of a
   * widescreen frame.
   */
  draw(camera: Camera, wireframe: boolean, viewport?: { width: number; height: number }): void {
    const gl = this.gl
    const canvas = gl.canvas as HTMLCanvasElement
    if (!viewport) {
      const w = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio))
      const h = Math.max(1, Math.floor(canvas.clientHeight * devicePixelRatio))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
    }
    const width = viewport?.width ?? canvas.width
    const height = viewport?.height ?? canvas.height
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    if (this.batches.length === 0) return

    // Framing and the view come from `@vesper/render`, so what the viewer
    // shows at any window shape is the same rule the game will use — never
    // less of the world than the hardware showed.
    const projection = perspective(width / height, 0.01, 1000)
    const view = viewMatrix(camera)
    const mvp = multiply(projection, view, new Float32Array(16))

    gl.useProgram(this.program)
    gl.uniformMatrix4fv(this.uMvp, false, mvp)
    gl.uniform1i(this.uWireframe, wireframe ? 1 : 0)
    gl.bindVertexArray(this.vao)

    for (const batch of this.batches) {
      if (batch.count === 0) continue
      gl.uniform1i(this.uHasTexture, batch.texture && !wireframe ? 1 : 0)
      gl.uniform2f(this.uTextureSize, batch.width, batch.height)
      if (batch.texture) {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, batch.texture)
      }
      gl.drawElements(
        wireframe ? gl.LINE_STRIP : gl.TRIANGLES,
        batch.count,
        gl.UNSIGNED_INT,
        batch.first * 4,
      )
    }
    gl.bindVertexArray(null)
  }
}
