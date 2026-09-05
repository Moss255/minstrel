# M1 — Renderer and model viewer: status

Against the milestone's own list.

| M1 task | status |
|---|---|
| WebGPU renderer with WebGL2 fallback | **WebGL2 only.** No WebGPU path yet |
| NSBMD / NSBTX / NSBCA import | **NSBMD and NSBTX done.** NSBCA not started |
| DS toon shading, edge marking, 5-bit colour | **5-bit colour done**, in reference mode. Toon shading and edge marking not started |
| Reference mode (256×192) plus scaled output | **done** |
| Debug overlay: asset browser, animation scrubber, wireframe | **browser and wireframe done.** No scrubber, since there is no animation yet |

**Done when:** you can browse and animate every slice model in a browser at any
resolution. Browsing works; animating does not.

## What reference mode is for

The milestone says to build it first because it is the validation tool, and that
is worth restating: comparing output against real hardware is only meaningful at
the size and colour depth the hardware works in. A 1080p render with 8-bit
colour hides precisely the differences worth catching.

So the scene is drawn into a 256×192 target, quantised to 5 bits per channel,
and blitted up at a **whole-number** scale, centred, with nearest-neighbour
sampling. Fractional scaling would resample the thing being validated; whole
numbers keep every hardware pixel a square block of identical output pixels.

It matches the hardware's **resolution and colour depth**, not its rasterisation
rules. Toon shading, edge marking and the depth quirks are not implemented, so a
reference-mode frame is not yet expected to match an emulator capture pixel for
pixel — it is the frame you would compare *in*.

## What the renderer does

- One draw call per shape, with the texture its material names bound.
- Vertices posed by the matrix their display list bound them to.
- Vertex colours multiplied with the texture; texels below 5% alpha discarded.
- An orbit camera, wireframe, and reference mode.

## What it does not

- **Normals.** The display list's `NORMAL` command is stepped over rather than
  captured, so there is no lighting model and nothing for toon shading to shade.
- **Polygon attributes.** `POLYGON_ATTR` carries the alpha, culling mode and the
  edge-marking and fog flags; it is skipped, so everything draws two-sided and
  opaque.
- **Texture coordinate transforms.** The material's transform mode is ignored.
- **Inverse bind matrices**, so blended vertices are placed approximately.

Each of those is a separate, bounded piece of work, and the first two are what
the milestone's toon-shading bullet actually needs.
