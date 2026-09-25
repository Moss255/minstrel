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

## Development query parameters

Both apps take `?rom=<url>`, which fetches a cartridge dump over HTTP instead
of using the file picker. It fetches only what the URL names, so it stays
inert unless a developer asks for it.

**The game's parameters are listed in `docs/regions.md`**, which is the
complete set and is also the specification for the debug menu that
`docs/beyond-the-slice.md` defers. They are not repeated here, because a list
kept in two places drifts: this file carried `sprite` and `cut` for a while
after both had been removed from the app.

The explorer's are below. **All of them apply only on the `?rom=` path** —
they are read where the fetched dump is loaded, so none of them does anything
when the cartridge comes from the file picker.

| parameter | meaning |
|---|---|
| `rom=/rom.nds` | fetch a cartridge from a URL instead of using the file picker |
| `path=/data/map/` | scan only cartridge paths containing this substring — a whole-cartridge scan is slow, and this is how a sweep is narrowed |
| `model=M01M0000` | select the first model whose path contains this substring; says so if nothing matches |
| `animation=walk` | choose the first animation whose name contains this substring, and rewind to frame 0. An empty value clears the animation |
| `frame=12` | hold that frame and stop playback. Needs an animation to be chosen first |
| `reference=1` | render at the DS's own resolution and colour depth |
| `yaw=0.8`, `pitch=0.3` | camera angles, in radians |

Both apps set `document.title` to `ready — …` once loaded and `failed` if they
throw, which is what `screenshot.mjs` waits on rather than guessing a delay.

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
