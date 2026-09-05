import type { Geometry } from '@vesper/nitro-gfx'

/**
 * A minimal WebGL2 renderer for decoded model geometry.
 *
 * Deliberately plain: flat vertex colours, depth test, an orbit camera. DS toon
 * shading, edge marking and the 5-bit colour pipeline belong to the reference
 * renderer and are not attempted here — the job of this one is to prove the
 * parsers put correct geometry on screen.
 */

const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aColor;
uniform mat4 uModelViewProjection;
out vec3 vColor;
out vec3 vViewPosition;
void main() {
  vColor = aColor;
  vec4 clip = uModelViewProjection * vec4(aPosition, 1.0);
  vViewPosition = clip.xyz;
  gl_Position = clip;
}`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vColor;
in vec3 vViewPosition;
uniform bool uWireframe;
out vec4 outColor;
void main() {
  if (uWireframe) { outColor = vec4(vColor * 0.5 + 0.5, 1.0); return; }
  // Cheap face lighting from screen-space derivatives, so untextured geometry
  // still reads as solid. Not a DS lighting model; purely a viewing aid.
  vec3 normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  float shade = 0.55 + 0.45 * abs(normal.z);
  outColor = vec4(vColor * shade, 1.0);
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

export interface Camera {
  yaw: number
  pitch: number
  distance: number
  target: [number, number, number]
}

function multiply(a: Float32Array, b: Float32Array, out: Float32Array): Float32Array {
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
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
  private readonly indexBuffer: WebGLBuffer
  private readonly uMvp: WebGLUniformLocation
  private readonly uWireframe: WebGLUniformLocation
  private indexCount = 0

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
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program failed to link: ${gl.getProgramInfoLog(program)}`)
    }
    this.program = program

    const uMvp = gl.getUniformLocation(program, 'uModelViewProjection')
    const uWireframe = gl.getUniformLocation(program, 'uWireframe')
    if (!uMvp || !uWireframe) throw new Error('shader uniforms missing')
    this.uMvp = uMvp
    this.uWireframe = uWireframe

    const vao = gl.createVertexArray()
    const positionBuffer = gl.createBuffer()
    const colorBuffer = gl.createBuffer()
    const indexBuffer = gl.createBuffer()
    if (!vao || !positionBuffer || !colorBuffer || !indexBuffer) {
      throw new Error('could not allocate GPU buffers')
    }
    this.vao = vao
    this.positionBuffer = positionBuffer
    this.colorBuffer = colorBuffer
    this.indexBuffer = indexBuffer

    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
    gl.bindVertexArray(null)

    gl.enable(gl.DEPTH_TEST)
    gl.clearColor(0.078, 0.086, 0.102, 1)
  }

  /** Upload the concatenation of several shapes as one mesh. */
  upload(geometries: readonly Geometry[]): { vertices: number; triangles: number } {
    const total = geometries.reduce((n, g) => n + g.vertices.length, 0)
    const positions = new Float32Array(total * 3)
    const colors = new Float32Array(total * 3)
    const indices: number[] = []

    let base = 0
    for (const geometry of geometries) {
      geometry.vertices.forEach((v, i) => {
        const at = (base + i) * 3
        positions[at] = v.x
        positions[at + 1] = v.y
        positions[at + 2] = v.z
        colors[at] = v.r
        colors[at + 1] = v.g
        colors[at + 2] = v.b
      })
      for (const index of geometry.indices) indices.push(base + index)
      base += geometry.vertices.length
    }

    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW)
    this.indexCount = indices.length

    return { vertices: total, triangles: indices.length / 3 }
  }

  draw(camera: Camera, wireframe: boolean): void {
    const gl = this.gl
    const canvas = gl.canvas as HTMLCanvasElement
    const width = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio))
    const height = Math.max(1, Math.floor(canvas.clientHeight * devicePixelRatio))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    gl.viewport(0, 0, width, height)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    if (this.indexCount === 0) return

    // Perspective, then an orbit view built directly rather than via a library.
    const aspect = width / height
    const fov = (50 * Math.PI) / 180
    const near = 0.01
    const far = 1000
    const f = 1 / Math.tan(fov / 2)
    const projection = new Float32Array(16)
    projection[0] = f / aspect
    projection[5] = f
    projection[10] = (far + near) / (near - far)
    projection[11] = -1
    projection[14] = (2 * far * near) / (near - far)

    const cy = Math.cos(camera.yaw)
    const sy = Math.sin(camera.yaw)
    const cp = Math.cos(camera.pitch)
    const sp = Math.sin(camera.pitch)
    const eye: [number, number, number] = [
      (camera.target[0] as number) + camera.distance * cp * sy,
      (camera.target[1] as number) + camera.distance * sp,
      (camera.target[2] as number) + camera.distance * cp * cy,
    ]
    const zAxis = normalize([
      eye[0] - camera.target[0],
      eye[1] - camera.target[1],
      eye[2] - camera.target[2],
    ])
    const xAxis = normalize(cross([0, 1, 0], zAxis))
    const yAxis = cross(zAxis, xAxis)
    const view = new Float32Array([
      xAxis[0],
      yAxis[0],
      zAxis[0],
      0,
      xAxis[1],
      yAxis[1],
      zAxis[1],
      0,
      xAxis[2],
      yAxis[2],
      zAxis[2],
      0,
      -dot(xAxis, eye),
      -dot(yAxis, eye),
      -dot(zAxis, eye),
      1,
    ])

    const mvp = multiply(projection, view, new Float32Array(16))

    gl.useProgram(this.program)
    gl.uniformMatrix4fv(this.uMvp, false, mvp)
    gl.uniform1i(this.uWireframe, wireframe ? 1 : 0)
    gl.bindVertexArray(this.vao)
    gl.drawElements(wireframe ? gl.LINE_STRIP : gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0)
    gl.bindVertexArray(null)
  }
}

type Vec3 = readonly [number, number, number] | number[]

function normalize(v: Vec3): [number, number, number] {
  const length = Math.hypot(v[0] as number, v[1] as number, v[2] as number) || 1
  return [(v[0] as number) / length, (v[1] as number) / length, (v[2] as number) / length]
}

function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [
    (a[1] as number) * (b[2] as number) - (a[2] as number) * (b[1] as number),
    (a[2] as number) * (b[0] as number) - (a[0] as number) * (b[2] as number),
    (a[0] as number) * (b[1] as number) - (a[1] as number) * (b[0] as number),
  ]
}

function dot(a: Vec3, b: Vec3): number {
  return (
    (a[0] as number) * (b[0] as number) +
    (a[1] as number) * (b[1] as number) +
    (a[2] as number) * (b[2] as number)
  )
}
