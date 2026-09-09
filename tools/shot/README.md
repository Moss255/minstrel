# shot

Renders a model in headless Chrome and writes a PNG, so a change to the parsers
or the renderer can be checked by looking at it rather than by hoping.

It drives Chrome over the DevTools protocol using Node's built-in `fetch` and
`WebSocket`, so it adds no dependency. It waits for the page to report itself
ready instead of guessing at a delay, which matters because loading a 256 MiB
cartridge is real work that a fixed timeout gets wrong.

Everything is local: the server binds to localhost and serves only the built
app plus the one cartridge you point it at.

It serves the explorer by default. Set `APP=game` to serve the game instead —
both take the same `?rom=` development parameters.

## Use

```sh
pnpm build                                    # build both apps

# terminal 1 — serve an app and your own dump
node tools/shot/serve.mjs rom/your.nds

# terminal 2 — render one model
node tools/shot/screenshot.mjs \
  "http://localhost:8765/?rom=/rom.nds&path=/data/map/&model=M01M0000" \
  out/shot.png 1600 1000

# or, with APP=game, stand inside the village inn — `door` takes the same path
# a doorway takes when you walk into it, which a headless browser cannot do
node tools/shot/screenshot.mjs \
  "http://localhost:8765/?rom=/rom.nds&map=M01&door=M01M02" \
  out/inn.png 1600 1000
```

Development query parameters. `rom` is common to both apps; the rest belong to
whichever one is being served.

| parameter | app | meaning |
|---|---|---|
| `rom` | both | URL of a cartridge dump to fetch instead of using the file picker |
| `path` | explorer | only scan cartridge paths containing this substring |
| `model` | explorer | select the first model whose path contains this substring |
| `animation`, `frame` | explorer | pick an animation by name and hold one frame |
| `reference` | explorer | `1` renders at the DS's own resolution and colour depth |
| `yaw`, `pitch` | explorer | camera angles, in radians |
| `map` | game | which map archive to open, by name; `M01` by default |
| `door` | game | take that map's doorway to the named map as soon as it loads |

`CHROME` in the environment overrides the browser binary.
