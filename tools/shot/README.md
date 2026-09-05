# shot

Renders a model in headless Chrome and writes a PNG, so a change to the parsers
or the renderer can be checked by looking at it rather than by hoping.

It drives Chrome over the DevTools protocol using Node's built-in `fetch` and
`WebSocket`, so it adds no dependency. It waits for the page to report itself
ready instead of guessing at a delay, which matters because loading a 256 MiB
cartridge is real work that a fixed timeout gets wrong.

Everything is local: the server binds to localhost and serves only the built
viewer plus the one cartridge you point it at.

## Use

```sh
pnpm build                                    # build the viewer

# terminal 1 — serve the viewer and your own dump
node tools/shot/serve.mjs rom/your.nds

# terminal 2 — render one model
node tools/shot/screenshot.mjs \
  "http://localhost:8765/?rom=/rom.nds&path=/data/map/&model=M01M0000" \
  out/shot.png 1600 1000
```

The viewer's development query parameters:

| parameter | meaning |
|---|---|
| `rom` | URL of a cartridge dump to fetch instead of using the file picker |
| `path` | only scan cartridge paths containing this substring |
| `model` | select the first model whose path contains this substring |
| `yaw`, `pitch` | camera angles, in radians |

`CHROME` in the environment overrides the browser binary.
