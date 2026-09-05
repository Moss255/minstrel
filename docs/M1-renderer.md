# M1 — Renderer and model viewer: status

Against the milestone's own list.

| M1 task | status |
|---|---|
| WebGPU renderer with WebGL2 fallback | **WebGL2 only.** No WebGPU path yet |
| NSBMD / NSBTX / NSBCA import | **done.** NSBCA tracks decode and play |
| DS toon shading, edge marking, 5-bit colour | **5-bit colour done**, in reference mode. Toon shading and edge marking not started |
| Reference mode (256×192) plus scaled output | **done** |
| Debug overlay: asset browser, animation scrubber, wireframe | **done.** Pick an animation, scrub the frame, play or pause with space |

**Done when:** you can browse and animate every slice model in a browser at any
resolution. Both work. What is left on the milestone is the WebGPU path and the
DS's shading rules.

## Where NSBCA stands

Read and played. The full account of the format and its evidence is in
`packages/nitro-gfx/FORMAT.md`; in short:

- A track's flags say which of translation, rotation and scale it carries and
  which axes of each are constant. The entry-size formula is exact — a track's
  computed length lands on the next track's offset 144,379 times out of 144,379.
- An animated axis is a curve: a first and last frame, a sample width, and an
  offset. Sample counts are measured, not assumed, and with them **no curve in
  any animation on the cartridge overlaps another**.
- Rotations are references into two pools, a compact pivot form and a five-value
  basis form, selected by the reference's top bit. All 9,543 pivot references
  and all 6,963 basis references resolve to orthonormal matrices.

The oracle that ties it together is the one this document previously called
unavailable: 2,404 archives hold a model and an animation with the same name and
the same bone count. Posing a model with frame 0 of its own animation reproduces
the model's **own bind pose for 21,306 of 21,808 bones**, and the remainder are
animations that legitimately do not open on the bind pose.

Cracking it also forced two long-standing renderer bugs into the open, because
they are invisible in the bind pose and glaring once a model moves: blend terms
need the named node's inverse bind transform, and each shape must be posed
against the matrix stack as it stood when that shape was drawn, not the stack
left at the end. Both are fixed.

### What is still open

- The three-bit code in a curve header takes a frame step of 2 or 4 on about 1%
  of curves; only step 1 is confirmed. The sample count used for the others is
  inferred and never over-reads.
- 420 of 1,138 skinned models still shift their blended vertices in the bind
  pose. The `0x40` node-transform parameter is the remaining suspect.
- Samples are not interpolated; a frame takes the sample that covers it.

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
- Vertices posed by the matrix their display list bound them to, taken from the
  stack as it stood when that shape was drawn.
- Skinned vertices blended across stack slots, each composed with the named
  node's inverse bind transform.
- Animation: pick one from the archive beside the model, scrub it, or let it run
  at 30 frames a second.
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
