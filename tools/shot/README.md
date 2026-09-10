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
| `sprite` | game | `1` shows the sprite cut and turns its keys on — see below |
| `cut` | game | `start,pitch,height,odd` — start from those numbers instead of the parser's |
| `collision` | game | `1` draws the collision mesh over the map: green stands, red stops |
| `fit` | game | `scale,x,y,z` — move and scale the collision, to fit it over the room |

`CHROME` in the environment overrides the browser binary. A flatpak Chromium is
`/var/lib/flatpak/exports/bin/org.chromium.Chromium`, which is on no `PATH` and
so is not found by the search.

## Driving the page before the shot

The game reads keys rather than key events, so a press has to stay down while
the simulation ticks. These run in order, before the capture:

```sh
node tools/shot/screenshot.mjs "<url>" out/shot.png 1400 900 \
  --hold=d:200 --drag=400,0 --wait=500
```

- `--hold=<key>:<frames>` holds a key down for that many frames — `w`, `a`, `s`,
  `d` to walk, and any of the collision-fitting keys.
- `--drag=<dx>,<dy>` turns the camera by dragging from the middle.
- `--wait=<ms>` waits.

The overlay's first line and the status line are printed after the driving, so
a position or a fit can be read without opening the image.

## Finding the sprite cut by hand

`?sprite=1` puts the three numbers that decide where a sprite's frames are on
the overlay and binds them to keys. Where a frame begins is settled for the
horizontal reading and not the vertical one, and six statistical criteria each
chose a cut that renders wrong — see the sprite section of
`packages/game-formats/FORMAT.md` — so the way left is to move it against the
picture and read the answer off the screen.

| key | moves |
|---|---|
| `[` `]` | the start, by a byte — two pixels across |
| `;` `'` | the start, by a row — one row down or up |
| `,` `.` | the pitch, the bytes from one frame to the next |
| `-` `=` | the rows in a frame |
| `9` `\` | bytes added to **odd frames only** |
| `0` | back to what the parser decided |

The odd-frame key is there for a specific suspicion. A frame occupies **41.5
rows**, measured three separate ways, and a half row of a 32-pixel sheet is
eight bytes — sixteen pixels across. If frames really are spaced by a half row
then every odd frame begins mid-row and its pixels land sixteen over from an
even frame's, which is what a head sitting at a different offset from its body
looks like. `8` or `-8` tests it.

The status line prints the three numbers after every change, so whatever looks
right can be read straight off it. Every sheet in the map is cut again on each
keystroke and the decoded frames thrown away, so the cast on screen is always
showing the current numbers.

The defaults are the parser's own reading: for the village's 32-wide characters
that is start 120, pitch 648, height 40, with a row of 16 bytes.

`?cut=` seeds them, so a candidate can be looked at without pressing a key
twelve times. **Worth trying first: `?sprite=1&cut=,660`.** Measured on three
characters, the horizontal centre of a head slides across the frames at 0.38 to
0.47 pixels a frame at a pitch of 648 and at **0.00 at 660** — which is the
drift that makes a head sit off from its body. Whether 660 is right by eye is
the thing to check.
