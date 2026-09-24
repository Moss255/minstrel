# Event scripts — how they are built, and how they run here

Written 12 September 2026. The format-level evidence is in
`packages/game-formats/FORMAT.md`, "Event scripts"; this is the technical account
of the whole thing — the file, the machine, the engine functions, how it was
worked out and what is still open.

Nothing about this format is published. Everything below was read from the
cartridge's 523 event scripts themselves, by statistics over all of them and by
reading individual scripts closely, and every reading was held to the whole
cartridge before it was kept. Readings marked **INFERRED** fit every case seen
but are not forced by it.

---

## 1. Where the scripts are

Each event is a Level-5 `GPC2` archive, `/data/event/ev#####.gp2` (read by
`@minstrel/l5-gpc`), holding:

- `ev#####.stb` — the script, magic `SB2\0`;
- `ev#####_de.bin` … `_it.bin` — its messages in five languages, tagged tables
  of `(number, text)` records (`readEventMessages`).

The script refers to its own messages by number. It does not name maps or other
events; which event runs when is decided by the area's triggers
(`trigger<area>.bin`), not by the script.

---

## 2. The file

```
+0x00  "SB2\0"
+0x04  u32  size of the shared block (0x1500 on 522 of 523)
+0x08  u32  end of the section table  — the CODE BASE
+0x0C  u32  start of the section table (0x40 on all)
+0x10  u32  section count
+0x18  u32  unknown_0x18 (0 to 5 on 122 files)
+0x40  section table: { u32 id, u32 file offset } × count
       shared block: the routine library, identical in 522 events
       sections, each a routine, each followed by routines of its own
       strings (ASCII names, Shift-JIS developer notes)
```

**The code base.** Every code address — a jump's target, a routine call's
target, a routine's own entry address — is an offset from the value at `+0x08`.
With the usual three sections that is `0x58`.

**Sections.** Numbered 200, 300 and 100 on 522 events; `ev03130` has 200, 201,
300, 301, 100 and 101. Section 100 is the largest (median 3,632 bytes).

### Routines

A section is a routine; so is everything in the shared block, and everything
after a section's own return.

```
+0x00  u32  entry address: (own offset − code base) + 0x38
+0x04  u32  0 wherever seen
+0x08  u32  locals — how many variables the routine has, its parameters among them
+0x0C  u32  params — how many values a call hands it
+0x10  u32 × 10  a 1 per parameter where there are any; not established
+0x38  instructions, to the first 0x0F
```

The entry address is what identifies a routine. It was first read as "own offset
less `0x20`", which is the same thing when the base is `0x58` — and wrong for
`ev03130`, whose six-entry table puts its base at `0x70`. Recognising routines by
the entry address, all 523 scripts read.

### Instructions

Three little-endian `u32`s: opcode, argument A, argument B.

---

## 3. The machine

A stack machine. Each routine call has a frame of locals; the operand stack is
shared by a thread's frames. `@minstrel/script` implements it:

- `ScriptThread` runs one routine and whatever it calls.
- `EventRun` runs an event's sections one after another, sharing the event's
  variables.
- `ScriptHost` is what the game supplies: engine functions, variables outside
  the event, and a note sink.

### Instruction set

| op | A | B | effect | status |
|---|---|---|---|---|
| `0x01` | index | scope | push the variable | read from use |
| `0x02` | index | scope | push a reference to it | read from use |
| `0x03` | type | value | push a constant: type 1 integer, 2 float bits, 3 string file offset | established: 153,272 pushes, only these types |
| `0x04` | | | drop the top value | read from use |
| `0x05` | | | pop value, pop reference; store; push the value back | read from use |
| `0x06` | | | add | read from use — see §6 |
| `0x07` | | | subtract | read from use |
| `0x0B` | | | negate the top value | read from use |
| `0x0E` | kind | | compare two values: 40 `==`, 41 `!=`, 42 `<`, 43 `<=`, 44 `>`, 45 `>=` | `==` read from use; the order past it INFERRED |
| `0x0F` | | | return, with the top value | established |
| `0x10` | target | | jump | established: every target in its own routine |
| `0x11` | target | when | pop; jump if its truth equals `when` | read from use |
| `0x12` | target | when | short-circuit: jump keeping the top value if its truth equals `when`, else drop it | INFERRED |
| `0x13` | | target | call the routine at `target` | established: 11,515 calls, every one onto a routine |
| `0x14` | 1 | | drop a string — a developer's note | read from use |
| `0x15` | n | | invoke an engine function: `n` values, the first its number | established |
| `0x16` | n | | nothing — a label, always at a jump's target | read from use |
| `0x17` | | | wait for the next frame | read from use |
| `0x19` | | | or | INFERRED: only ever of flags, `4 \| 16` |
| `0x1A` | | | not | read from use |

`0x08` occurs once, in a shared routine no event calls, and is not read; the
machine stops with a `ScriptError` on it, and on anything else unread, rather
than guess.

### Calling a routine

```
push arg1 … push argN     ; N = the callee's params
0x13 _, target            ; enter: args become locals 0..N-1, the rest are 0
0x04                      ; drop the return value, when unused
```

A routine returns with `0x0F`, taking the top value back to its caller; routines
end `push 0; 0x0F` when they have nothing to say.

### Invoking an engine function

```
push 200 ; push 9 ; 0x06  ; the function's number, written as a sum: 209
push …                    ; its arguments
0x15 n                    ; n = 1 + the argument count
```

The host is handed the number and the arguments and returns a value, which is
pushed. An argument that is a reference (`0x02`) is how a function answers
through it: `405` is handed one and writes into it whether the message is still
showing.

### Variables

| scope | what | status |
|---|---|---|
| 1 | the routine's own locals | read from use |
| 8 | the event's: shared by its sections — one writes a character's position, another reads it back | INFERRED |
| 64 | the game's: `L0@64 == 0` beside a note about death and revival | INFERRED; the host keeps them |

### Waiting

Nothing in the machine knows about time except `0x17`, "wait for the next
frame". Every wait is a loop in script: the shared library's wait counts a local
down with a `0x17` each time round; its message routine shows a message and then
asks `405` every frame until it answers 0. The machine is stepped once per frame
by the game; `EventRun.step()` returns false once every section has finished.

### Section order

**Not established.** The game here runs 200, then 100, then 300: 200 loads the
event's cast and sets its options, 100 is the scene, 300 hands control back.
Sections numbered otherwise are not run.

---

## 4. The shared library

The same bytes in 522 of the 523 events. Offsets from the code base; call counts
over every event, where they were counted. What each routine calls is read; what
that amounts to — a fade, a sound, a walk — is INFERRED from those calls.

| entry | params | does | calls |
|---|---|---|---|
| `+0x0` | 1 | wait that many frames | 6,982 |
| `+0x104` | 1 | a wait against `840`; no event calls it | 0 |
| `+0x28C` | 0 | wait while `507` says a fade is running | — |
| `+0x3C0` | 1 | start motion with `213`, wait on `234` | — |
| `+0x548`, `+0x5E0` | 1 | wait, then wait for the fade | — |
| `+0x678` | 0 | wait while `725` says a sound is playing | — |
| `+0x7AC` | 1 | play sound `720`, wait for it, `724` | 19 |
| `+0x88C` | 2 | `813`, then wait on `814` | — |
| `+0x9FC` | 3 | show one of two messages as `560` answers, hand `554` the third, wait | 26 |
| `+0xC68` | 1 | show a message with `400`, wait on `405` | 898 |
| `+0xDE4` | 2 | show a message with `400`, hand `554` the second value, wait on `405` | 2,352 |
| `+0xF9C` | 2 | wait while `204` says character N is moving | — |
| `+0x10C4`, `+0x11F8`, `+0x1374` | 2–3 | motion helpers over `202`, `203`, `205` | — |
| `+0x14A8` | 0 | return 0 | — |

---

## 5. Engine functions

139 numbers are invoked, met by running every event against a host that answers
everything with 0 — so only the paths that run that way are seen. The hundreds
group what they touch. Signatures: `i` integer, `f` float, `s` string, `r`
reference, `-` nothing; the two commonest are shown. Whole numbers are stored as
integers, so `iifi` may be a vector with two zeros.

Readings are INFERRED from the arguments and where the calls stand, unless the
row says otherwise. "—" means not established.

| fn | calls | events | signature | reading |
|---|---|---|---|---|
| 0, 2 | 9,994 each | 1 | `r` | — polled by `ev53174` only |
| 8 | 4 | 4 | `-` | — |
| 9 | 62 | 62 | `-` | — in section 200 |
| 101 | 612 | 368 | `i` | **fade the screen to black over n frames** — INFERRED: of the 676 events played to their end, 416 open on one and most of the rest end on one, and after each the script waits n frames before its next call (`101(16)` 17, `101(12)` 13). A let's play shows the darkening at `ev02510`'s start (12 frames) and end (16), and at `ev02500`'s end |
| 102, 103, 105, 107, 112, 114, 116, 117, 119 | 3–114 | | `i`, `ii`, `iiii` | — |
| 120, 121 | 362, 563 | 328, 444 | `i` | 121: **fade the screen back from black over n frames**, the script waiting n as for 101 — the commonest sequence, 188 events, is 101, then `120(0)` and 121 as the scene is set, then 101 at its end. `ev02510` comes back over 16 frames so. 120 is handed 0 on 365 of its 366 calls, always just before a 121; not read |
| 204 | 78,948 | 7 | `ir` | whether character N is still walking or turning; polled |
| 206 | 1,600 | 418 | `ifff` | put character N at x, y, z, in the map's units — the morning puts the Hero in the bed of `M01M10` and at its side |
| 207 | 1,445 | 304 | `ifffi` | walk character N to x, y, z over n frames, facing the way it goes — the morning's Erinn goes round the wall to the bedside |
| 208 | 1,526 | 413 | `iifi`, `iiii` | set character N's rotation: x, y, z in radians; the y is the facing |
| 209 | 1,049 | 257 | `iifiii` | turn character N to a rotation over n frames |
| 210 | 3,580 | 520 | `is`, `isi` | play character N's motion by name, with flags. **Bit 1 of the flags plays it once** — INFERRED: a `224` follows at once 1,471 of the 2,534 with it set, and 21 of the 4,345 without; the morning's `cyotto_loop`, Ivor's `bk` and `talk` on Erinn's doorstep. Played once, the motion goes on to the one `224` names, or holds its last frame where none does (ours). Bits 16 and 4 are not read |
| 221 | | | `iii`, `iiii` | turn character N to face character M over n frames, the short way — INFERRED: of 45 calls in the 49 Angel Falls events played, the two are never the same character, and of the 22 that find both placed, 17 find N facing elsewhere. The morning's `221 1 0 5 0` turns Erinn to the Hero after she has walked to the bed; `ev02210`'s `221 1 0 5 1` turns Ivor back to the Hero at the side of Erinn's house. The fourth value, 0 or 1 or missing, is not read |
| the other 200s: 211, 214–218, 222, 223, 226, 227, 232, 234, 235, 238–240 | 2–950 | | | — the cast; 216 (`ifff`, 713) the busiest. 223 (`ii`, 0 or 1, 14 calls played) comes with fades |
| 219 | 950 | | `ii` | how much of character N shows, at once, from 0 to 31 — INFERRED: the DS's polygon alpha is 5 bits, and of the 998 calls every event played, all but three (255) hand a whole number 0–31, 0 and 31 the commonest. Ours takes 255 as whole |
| 220 | | | `iii`, `ii` | fade character N to that much over n frames — INFERRED: all 313 targets played are whole numbers 0–31; after `219(N, 0)`, 72 go to 31 and 39 to 0. The Hexagon's figure fades in so on `ev02500` (`219(1, 1)`, then `220(1, 31, 90)`) and out on `ev02520` (`220(1, 0, 60)`), as a let's play shows. Nine hand no frames, taken as at once |
| 224 | 451 | 196 | `is`, `isi` | the motion to go on to when one played once ends — see 210: it follows at once 1,471 of the 2,534 played once, `talk` → `stand`, `miage_in` → `miage_loop`, `ud_out` → `stand`; the morning's `cyotto_loop` → `stand` |
| 300 | 1,016 | 477 | `-` | — first in a scene, before 303 and 310; played as letting the camera go |
| 301, 306, 317, 322, 324, 327, 328 | 3–142 | | | — the camera; 302, 304, 311 and 321 are read — where the camera is, and its moves over so many frames: see `event.ts` |
| 303 | 892 | 366 | `fff` | where the camera looks: the morning's (2.03, 1.56, −0.87) is between the bed and Erinn's walk |
| 310 | 895 | 366 | `fff` | where it looks from: a yaw, how far up, and how far away in a straight line — the morning's `0, 7.62, 12.71` is 37° down. First read as how far back across the ground, 31°; the second event folder's `302`, where the camera is, agrees with the straight line on 1,024 of its 1,032 shots and with the ground on 539 |
| 400 | 23,119 | 462 | `i` | **show message n** — handed the event's own message numbers |
| 401, 410, 411, 413, 414, 417 | 1–32 | | `-` | — |
| 405 | 241,319 | 462 | `r` | whether the message is still up; polled |
| 509, 512 | 23, 36 | | `iii`, `ii` | — |
| 532 | 1,321 | 518 | `i` | — handed 15 and the like; a fade? |
| the other 500s, from 536 to 599 | 1–582 | | | — the event and the screen |
| 554 | 22,235 | 373 | `i` | — handed the message routine's second value |
| 558 | 4,022 | 39 | `r` | — polled |
| 560 | 252 | 112 | `r` | **whether the scene carries straight on from a conversation** — INFERRED: played answering 1, 100 of the 118 scenes that ask skip their opening fade (`101(16)`, and `121(1)` in its place), and 89 of those 100 are begun by talking or examining (value 5 = 0 or 1). A let's play shows the two begun so in the Hexagon, `ev02500` and `ev02520`, not fading in. In some 20 its answer also chooses between messages. Ours answers 1 for a scene a talk record plays, 0 for any other |
| 566, 567 | 2,303, 453 | 522, 218 | `ii`/`isi`, `si` | what each character is, in section 200: by the first value, `2` a model file for character N (`chara_sub/s016.chr`), and **`5` one of the map's cast, by placement id** — INFERRED: of the 217 such numbers in events whose own record names their map, **186** are in that map's cast. `ev02510`'s `566(5, 204, 1)` makes character 1 the Hexagon's figure, which its four `207`s then lead to the statue room, as a let's play shows. **`3` a sprite sheet** — all 203 name a `.spr` file: `n012g.spr` is the figure fading in on `ev02500`, and is drawn so. `6` names a monster file, and `0` and `1` take two values; those are not read. 567 hands character N a motion pack |
| 570 | 111,451 | 517 | `ii` | — polled |
| 571 | 1,195 | 513 | `ii` | — |
| 595 | 501 | 501 | `r` | — once per event, in section 300 |
| 596 | 465 | 152 | `irr` | — |
| 600, 602, 603 | 14–28 | | `ir` | — |
| the other 700s, from 706 to 733 | 2–465 | | | — sound |
| 720 | 16 | 16 | `i` | play sound n |
| 725 | 16 | 16 | `r` | whether it is still playing; polled |
| 724, 727, 731 | 16, 503, 506 | | `-` | — 727 and 731 once per event, in section 300 |
| 800–808, 828, 829, 842 | 1–14 | | | — |

---

## 6. How it was worked out, and what went wrong on the way

1. **Word statistics.** The event's own message numbers occur in its script
   after the words `3, 1` in 7,692 of 8,963 cases — a typed operand. That was
   the thread to pull.
2. **Three-word alignment.** Walking a section from `+0x38` in 12-byte steps
   gives opcodes below `0x20` only, with `3, type, value` as the commonest; all
   1,572 sections of the 523 events walk that way to a `0x0F`. The first walks
   stopped at the lowest string a section pointed to, and cut large sections
   short — strings may sit earlier in the file; ending at the return fixed it.
3. **The call.** `push 200, push 9, op 6, …, 0x15 n` looked like "begin a call
   to group 200, function 9; invoke with n − 1 arguments", and 91% then 98% of
   invokes fitted. The misfits were `&0 L0 1 op6 store` — which is `x = x + 1`
   — and `4 1 op6 2 op6` building a flag. **Op 6 is add**, the function number
   is the sum, and `0x15 n` takes all `n` values including it. Read that way,
   every invoke on the cartridge finds its values.
4. **The code base.** A disassembly of the shared block came out four bytes out
   of step until addresses were counted from `+0x08` rather than from where the
   block starts; then every routine began with its header and every call landed
   on one.
5. **The entry address.** One event would not read: its sections' first word was
   own offset less `0x38`, not less `0x20`. Both are `(offset − base) + 0x38`.
6. **The machine against the whole cartridge.** `tools/harness/test/scripts.test.ts`
   reads every script, follows every routine call, checks every opcode is read,
   and runs every event to its end against a null host: **504 of 523 finish**;
   the other 19 wait on `405` (a message), `570` or `204` (a character) for an
   answer a null host never gives.

---

## 5a. The dispatch, and a first four read from it — 23 September 2026

**How a number becomes code.** The VM's invoke (`0x021d4bc8`, overlay 17) does
no searching: `fn = vm->fnTable[number]`, with the number checked against a
count of 1,000 and a null slot answered by doing nothing. Overlay 1 fills that
array from a static table of `{function, number}` pairs at `0x02164d6c` —
**304 entries**, which is the event and field set; the ARM9 and overlay 23
register their own tables into the same VM for other kinds of script. The
numbers registered run 0–9, 100–122, 200–240, 300–328, 400–421, 500–522,
530–603, 700–738 and 800–845.

The 200-group handlers do not act at once: each queues a command on one of the
character's eight queues, which a per-character tick (`0x0215a134`) walks, and
a command that is not finished holds its queue for the frame.

**214, 215, 216 and 217 are one feature — a waypoint path.** They share a
queue with 206 and 207, and they work on a sub-object at the character's
`+0x11C` that holds sixteen points, a speed and a spline:

| fn | handed | what it does |
|---|---|---|
| 214 | character | **resets** the path — the sixteen points, the speed, the spline and its flags (`Path_Reset`, `0x02157908`) |
| 216 | character, x, y, z | **appends a point**, each float times 4,096 into fixed point. **The fourth and fifth values are read by nothing.** Past sixteen points it drops them without a word (`0x02157964`) |
| 215 | character, speed | **sets the speed**. The path's length divided by it is how long the walk takes (`0x021579ac`) |
| 217 | character | **runs it, and waits**: builds the spline, activates it, and each frame samples it into the character's position and facing until it ends (`0x0215944c`) |

The spline duplicates its first and last points, which is Catmull-Rom's shape.
The counts bear the reading out: 1,153 calls across 65 events, with 214, 215
and 217 called about 129 times each — once a path — and 216 767 times, six or
so points apiece. The first point of a path is nearly always where `206` has
just put the character.

**Not read**: what the duration is counted in. The game divides the path's
length by the speed and hands the answer to the spline; what the spline's time
base is was not followed. `apps/game/src/event.ts` takes it for seconds, which
puts `ev02810`'s shuffles at about a dozen frames apiece — **ours**, and
marked.

**532 is the camera's field of view**, in degrees, read at the same time
(`0x0215f968` → `Camera_SetFov`, `0x0202e9a4`, whose `71/4096` is a degree in
radians). The engine keeps its sine and cosine and hands them to the DS's
perspective matrix. It takes an integer or a float. That is the number
`docs/still-open.md` has as ours, set by eye at 50°.

**554 is not read.** It stores its integer in a field of the global field
controller which selects one of three variants of something; what that
something is was not established, and nothing should be assumed from it.

## 5b. Staging a scene's cast — 502, 503, 506, 507, 508, and 203, 205, 212

Read 23 September 2026, from overlay 1. Eight numbers that turn up together in
the same 118 events are one block: **loading the models a scene needs, and
binding them to its characters.**

| fn | handed | what it does |
|---|---|---|
| 502 | partition, reset? | makes one of the 33 VRAM partitions current, emptying it first unless told not to |
| 506 | 1–3 names | queues them on the background loader — `chara/p_…` from `chara_pc.gp2`, `.mon` from `enemy.gp2`, anything else `data/<name>` |
| 507 | reference | **1 while any queued file is still loading, 0 once all are done or failed** — the script spins on this |
| 503 | partition | writes the partition's use back, ending the bracket |
| 508 | — | drops the task list |
| 203 | character | unbinds a character from its display entry and clears its movement state |
| 205 | character, entry | points a character at a display entry |
| 212 | slot | destroys the model object in a slot and clears every display entry that pointed at it |

The order is: `502` → `506` → spin on `507` → `200` builds the model from the
loaded bytes into a slot → `202` gives a display entry that slot → `205` points
a character at the entry → `503` → `508`; and on the way out `212` and `203`.

**A character and its display entry are always the same number**: all 1,324
calls of `205` pass the same value twice, which is why this repository's `202`
could dress a character directly and be right.

**Nearly all of this is the DS's, and this engine has none of it.** It holds the
whole cartridge and reads from it as it goes, so there is no VRAM to portion out
and nothing to wait for. `apps/game/src/event.ts` keeps the two things a script
can see — the list `506` asked for, and `507`'s answer that nothing is still
loading, which is what lets the spin end — and does nothing for the partitions.

## 5c. The seven the next town wanted — 23 September 2026

Read together because the coverage table said one area, C02, wanted these
seven and nothing else the slice did not want already.

| fn | handed | what it does |
|---|---|---|
| 8, 9 | — | **set and clear one global flag**, which decides whether entering a zone applies its masks of opened chests and doors. Every event's section 200 clears it. What the flag is *for* was not established |
| 218 | character, ticks | **waits**, on the same queue the character's motions run on — a pause between them |
| 543 | character, 3 references | **where it is**: the vector that goes to its position |
| 544 | character, 3 references | **which way it faces**: the vector that goes to its rotation, in **degrees** |
| 540 | group, object | **opens a door placement**, swinging it 35° or 28° or sliding it along its facing, with a sound its material picks. 584, 585 and 586 are the same with another swing |
| 563 | group, object | **closes it again** |
| 597 | reference | the **lighting's time of day**, a slot of 0 to 6 |
| 800 | reference | **1 where the Hero is a man**, 0 where a woman — a bit of the protagonist's own record, which `sg00m.chr` and `sg00w.chr` pair up with |

**What this engine does with them.** It waits, hands back a position and a
facing, says the Hero is a man — the slice's is a preset — and keeps which
door placements a scene has opened. Three are **ours** where the game's is
something this engine has not got: the rotation's x and z, since a character
here keeps one angle; the time of day, since the game's slot runs 0 to 6 and
this engine has three; and the doors, which here are the doorways a walk goes
through rather than placements that swing, so nothing draws them yet. The flag
`8` and `9` toggle has no counterpart at all, there being no masks to apply.

**What it was worth**: C02, the cheapest town outside the slice, wanted seven
engine functions the slice did not. It now wants none — the first area outside
the slice to stand level with it.

## 5d. Sound, the camera's shake, and the rest — 23 September 2026

**The sound block, 700 to 738, is NNS SDAT**, and this engine had one of its
numbers backwards. `726` **loads** an archive of a scene's own sounds and
`730` a second; `728` and `732` **play a sound out of the archive loaded**, by
its number within it; `727` and `731` give the archives back; `723`, `729` and
`733` stop one sound by the handle it was given, of sixteen. `712` plays out of
the **base** archive — `se_norm.sdat`'s 100 — which is what the field mounts.
This file had `726` as *play archive n*, INFERRED from its values all being
archive numbers. They are; it loads them.

**`554` is the talking blip**, and it is the most-called function on the
cartridge — 13,496 calls across 487 events, once a speaker. It picks which of
three looping sounds of the base archive runs while a message types itself
out: `10` at its own pitch, `12` low, `11` high. The names in the sound
archive say it plainly — `SE_SY010_L_kaiwa_n_010`, *kaiwa* being conversation.
It was the one number an earlier reading could not place.

**`317` is a camera shake**, and the most widely wanted number on the
worklist. It adds the same offset to the camera's eye and to what it looks at,
so the view moves without turning, and takes it off again before the next
frame; the offset is in the world's own axes, on a four-frame square wave — on,
nothing, off, nothing — for as many frames as it is given, or for ever below
zero.

**It does not fade, and that is a bug in the game.** The handler works out a
decay every fourth frame and stores it in the queued command's amplitude,
while the offset it actually applies is a copy taken once at the start and
never written again. The decay is therefore dead: a shake holds its size for
its whole length. This engine copies the behaviour, not the intent.

| fn | what it does |
|---|---|
| 301 | whether the camera still has work queued |
| 305, 306 | move what the camera looks at, and where it is, over a count |
| 321 | aim at a point, keeping the camera's own distance and angle |
| 222 | stop what a character is playing, queued behind its other commands |
| 545, 546 | a character starts and stops walking — the second value is an **animation rate**, not a speed over the ground |
| 541, 561, 542 | a balloon over a character's head — one of the field's sprite sheets, parked 76 pixels above it, nudged, taken down |
| 595 | a flag of the field's, **meaning not established** |
| 596 | look up a character a scene registered: its kind, a state, and the object it became |

**A thing worth knowing about `596`**: it writes its second answer whether or
not it was given anywhere to put it, so a two-argument call writes one place
past the end of its own arguments. That is the game's; this engine does not
copy it.

## 5e. The worklist head, and the towns' shared set — 23 September 2026

Two more clusters read out of the decomp, both picked from the coverage table
rather than from a hunch: the head of the story-ordered worklist, and the seven
numbers the eight towns had in common.

**The brightness family is eighteen functions, not two** — and the whole of it
is now read. The handlers `111` to `122` are uniform three-instruction stubs,
`mov r0,#<type>` into one dispatcher at `0x0215b074`, with **type = fn − 105**;
`100`, `101` and `104` to `107` are bespoke handlers calling the same setters
directly, filling types 0 to 5. So the **types run 0 to 17 unbroken while the
numbers do not**: `102`, `103` and `108` to `110` are other features wedged
into the range, which is why `106` is the top screen and `111` starts at type
6 rather than 11.

The type picks one of nine setters — three screens times three locking kinds:

| | both screens | top | bottom |
|---|---|---|---|
| set, to normal | `100` | `106` | `104` |
| set, to a level | `101` | `107` | `105` |
| set and lock, to normal | `111` | `115` | `113` |
| set and lock, to a level | `112` | `116` | `114` |
| unlock and set, to normal | `117` | `121` | `119` |
| unlock and set, to a level | `118` | `122` | `120` |

Every one takes **a frame count and an optional level**. An **even type passes
0**, normal, whatever the scene gave it; an **odd type passes the argument**,
defaulting to **−16, black** (`mvn r5, #0xf` in all nine setters). The frame
count becomes milliseconds (`× 1000/60`, the literal `0x41855604`) inside the
setter, and a count of 0 applies at once.

So **`120` is the bottom screen**, not the top — it is the pair of `121`, not
its opposite. And `107`, the second most-wanted number on the whole cartridge
(162 events), is simply **the top screen fading to black**.

**The lock is real.** `SetAndLock…` writes the level and then a lock byte —
`+0x24` for the top screen, `+0x25` for the bottom — and a plain `Set…`
**returns without doing anything at all** while its screen's lock is set
(`0x0203b1a4`). `UnlockAndSet…` clears it first. A scene that locks a screen
black and never unlocks it stays black through every later fade.

This engine draws one screen, so the bottom's darkness is kept and not drawn.

**`108`, `109` and `110` are not brightness.** All three write **bit 15 of
`POWCNT1`** (`0x04000304`), the DS's display swap — which physical screen the
main engine drives. `109` sets it, `110` clears it, `108` reads it and writes
the opposite. They are three of the five numbers wedged into the block.

**`102` and `103` are a colour over the screen**, and only half read. Both
write the same small record at `0x02108d5c`: `103` packs its first three
numbers as `r | g<<5 | b<<10` into a **halfword at `+0x02`**, which is the DS's
own BGR555, and writes `0x1f` at `+0x04`; `102` writes `1` there and no colour
at all. Both then write `frames × 1000/60` milliseconds at `+0x08` and `1` at
`+0x00`. **What reads that record was not found** — no other address in the
ARM9 holds its address — so the meaning is INFERRED: `+0x04` looks like the
DS's 0-to-31 blend coefficient, which would make `103` a fade *to* the colour
and `102` a fade back *from* it, and `102` naming no colour fits that. What
this engine keeps is exactly what the two write, and no more. Note the packing
masks nothing: a component above 31 runs into the next channel.

**`211` moves a character to a point without turning it**, which is what tells
it from `207`. It queues one of two commands on the character's own queue: with
no fifth argument, or one not above zero, **opcode `0x10`, which sets the
position outright**; with one above zero, **opcode `0x11`, which works out
`(there − here) ÷ frames` on the first tick and adds it each frame after**.

**`322` is not two points.** It queues two commands on two of the camera's
queues at once — the look-at point to its first three numbers, the orbit (yaw,
height above the point, distance from it) to its next three, both over the
seventh. The eye it hands the first command is a zero vector, and that zero
never shows: the command sets the flag that makes the camera recompute its eye
from point and orbit at the end of the frame. `304`, which looks the same
shape, genuinely is two points.

**The camera's angles are radians, in fixed point.** The yaw is wrapped modulo
`0x6488` — 25,736, which is 2π × 4096. `322`'s eighth number is which way round
the yaw turns: **−1, the short way**, when the scene does not say; 0 backwards;
anything else forwards. The game finds the short way by taking both wrapped
differences and choosing the smaller. That settles a unit this file had only
inferred from `310`'s values.

**`703` to `709` are empty.** All seven are the same two instructions —
`mov r0,#1; bx lr` — at `0x021634e0` through `0x02163510`: no arguments, no
reads, no writes, the success code every other handler returns. Whatever they
were for was taken out before this build, and there is nothing in it to find.
They leave the worklist for good rather than being answered with 0 and counted.

| fn | what it does |
|---|---|
| 105, 120 | fade the **bottom** screen to a level, −16 by default, over a count |
| 233 | load a monster model out of `data/pack_lv5/enemy.gp2` into a game-object slot; a negative slot maps by `-x + 0x9f` onto `0xa0`–`0xbf` |
| 328 | move the camera back to its idle eye and look-at point over a count |
| 547 | begin the scripted battle: a placement id for the transition's model, and a record index into `data/event/eventbattle.bin` which picks the battle and, from `+0x0e`, its music — **−1** when the scene gives one number |
| 558 | which of a message's choices is highlighted, 0-based, stored through a reference |
| 573 | take a placed `.spr` away — the exact inverse of `521`, which builds one. **Its second argument is read by nothing** |
| 574 | show or hide a thing the map placed: group key, record id, and a third number that **clears the hidden bit when it is not zero** |
| 575, 576, 577 | the same record's fixed-point position (`+0x08`), a halfword (`+0x06`) and a second vector (`+0x14`). Only the position's meaning is settled — `540`'s door code moves a door by writing it |
| 603 | read one of the game's story flags into a reference, 1 or 0. Ids from `0x400` up are displaced by 1,786 bits into a second range of the bank; nothing is bounds-checked |
| 715 | the sound's master volume, **clamped to 0..127**, ramped over a tick count; the manager scales it by the player's own 1-to-5 setting before the mixer |
| 721 | fade the live sequence player to silence over a count, **30 by default**; 0 stops it outright |

**Two of these write through a reference**, and the store is worth knowing:
`func_ov017_021d6134` writes **only the four-byte value** of the thing referred
to, and only when its tag is 3. It leaves the tag alone. That is how `558` and
`603` both answer.

**What was not determined**, and is written down so it is not re-read:

- What holds the brightness lock that `120` and `121` clear, and the byte at
  `+0x102` that the odd fade types poke through `func_ov017_0218b5b0`.
- What bit 6 of a map placement's flags is for — `574` always sets it, and
  nothing found reads it. Bit 2 is confirmed hidden, by the draw path.
- What tells placement kind 2 from kind 6 in `573`, or what kinds 0, 4 and 5
  are: nothing in overlay 1 assigns the tag.
- The size of `603`'s flag bank, and what its two id ranges mean.
- Which mixer channels `715`'s indices 5, 6 and 7 are.
- The fixed-point base of `233`'s `0x10a` scale. It is **not** the `0x1000`
  the neighbouring code uses for 1.0, so it is not applied here.

## 5f. Four clusters at once — 23 September 2026

### `568`, the most-called number on the cartridge, does nothing

309 calls across **476 of the 687 scripts**, and at the moment it is called it
has no observable effect at all. It is variadic, and ORs each number it is
given into a **27-bit flag field** on the scene's context — keeping the top
five bits, which are a count of the characters `566` has spawned, so the
keeping is load-bearing rather than incidental. It never clears a bit, never
fails, and checks nothing.

The effect is all later. The scene's **setup** reads the field and turns each
bit's subsystem *off*; the scene's **teardown** reads it again and turns them
back *on*. Five bits have readers:

| bit | what the setup does |
|---|---|
| `0x01` | clears bit `0x008` of the game's flag word — exactly what `536` does with a first argument of 0 |
| `0x02` | clears bit `0x010` of the same word |
| `0x04` | clears a draw flag on game objects 0 to 3, and the teardown puts it back on the ones the scene's cast does not hold |
| `0x08` | clears bit `0x400` — `536` with a first argument of 1 |
| `0x20` | clears bit 2 of the placement manager's own word — what `581` switches |

**Bits 6 to 26 have no reader anywhere in the cartridge.** So what every scene
is doing when it calls `568` is declaring which subsystems to suppress while it
plays. A reimplementation that has none of them has nothing to do — which is
the useful answer, and not one that could have been guessed from the call
count.

### The caption — `409` to `414`

Six numbers that always travel together, and the code says why: every one
writes a field of **the one message window**, and every field they write is one
that `400`'s show routine has just reset. They are a scene's word about the
message `400` started, and the next `400` undoes them.

| fn | what it writes | what that does |
|---|---|---|
| 410 | `+0x19b1 = 0` | **no window box** — and with it, the per-frame reset of the box's geometry stops |
| 411 | flags `\|= 0x40` | **centre the text**: each frame it counts the lines and puts the block at `(192 − (lines−1)×20 − 8) ÷ 2 − 16` instead of the box's own 116 |
| 414 | flags `\|= 0x80` | **outline the glyphs**: four passes in colour 1 at the four neighbours of (2,2), then the glyph in colour 15 |
| 412 | flags `\|= 0x02` | **shadow them** instead — `414`'s alternative, not its companion |
| 413 | `+0x19b2 = 0` | **silent**: no sound as the text types |
| 409 | `+0x19a8 = n`, flags `\|= 0x04` | **time it**: a second of hardware alpha in, `n` frames of hold, a second out, the message tick frozen throughout |

Together: *show this message as a caption over the scene rather than in a
box.* Two of the couplings are mechanically forced, which is why the
co-occurrence is total — without `410` the geometry is rewritten to the bottom
box every frame so `411`'s centring never survives, and the outline of `414` is
only needed once the box is gone. The game has the same preset written out by
hand in C++ in four places, in overlays 17, 25 and 26.

`409`'s second is a second because the engine steps a level of `0x1f0000` by
`0x8444` a frame, and those divide to exactly 60.

`400` itself came out better understood: the number is a **key looked up
linearly**, not an offset, an unknown key shows nothing and hands back 0, a raw
string is taken in its place, and there is an optional second number **only
whose bit 0 is read**.

### Arm and go — `713` and `714`

`713` hands its number to the sound manager's play routine, which **loads** the
sequence and its bank into the sound heap, starts it and registers it as the
current tune — and then `713` **stops the player dead**. So the tune is
resident and silent. `714` takes no arguments and **restarts whatever is
registered**; there is no load anywhere in its path, which is the mechanical
proof that it depends on `713`. It also slams the volume to 127.

`713` takes its number either as its only argument or as the **second of two,
the first read and thrown away**.

**Five more inert numbers**: `716` to `719` and `724` are the same two
instructions as `703` to `709`. Twelve in the sound range altogether.

`725` answers whether `720`'s jingle is still pending or still sounding.
`801` answers whether a session of one global subsystem is up — **INFERRED**
to be the wireless manager, from a six-byte address compare, a 21-byte name
with `"unknown"` for a default, and a state word whose values match the DS's
own wireless states. Nothing names it.

### The bone camera — `572`, `531`, and `213`

`572` takes a placement id and **two bone names**, and installs a camera that
each frame reads the two bones out of the model's pose and puts its **eye at
the first and what it looks at at the second**. The placement must be of kind 1
and hold a model or the call does nothing. The camera it replaces is stashed in
one word of the event's state, and **`531` is that word's only reader** — a
save-and-restore pair joined by data, not by numbering. `530` and `552` are the
same thing over a monster slot and over three bones.

**`213` is its synchronisation**: it queues a command on the character's
*third* channel whose handler asks the placed model whether its animation has
stopped, and holds the channel while it has not. So the idiom is: install the
bone camera, wait for the animation, give the camera back.

A hazard in the game worth recording: what `213` asks is set on the one frame
an animation goes from playing to stopped and cleared after, so a wait begun
*after* the animation ended never ends.

**`327` is the camera's roll** — a bank, a Dutch angle, not a turn. Its number
is in **degrees**, converted by the same `0x47/4096` the field of view uses and
then wrapped to a turn; the view matrix takes the world's up straight when it
is zero and rotates the world's up about the view axis when it is not. That is
a *second* function converting degrees the same way, which is the strongest
evidence yet that the engine's own angles are radians. Writing it also stops a
roll already under way.

**`512`** sets or clears a **raw 32-bit mask** in the same flag word `568`'s
bits reach — the script's way at all of it — and **`587`** rewinds one of the
event's eight heaps to its start, dropping every saved state. Neither is
bounds-checked; heap 0 holds the scene's own character and placement arrays.

## 5g. What the clusters gave away for nothing — 23 September 2026

Reading a cluster turns up its neighbours. These fourteen cost nothing beyond
checking them against the binary, because the walks that settled `568`, the
caption and the flag word had already passed through them.

**Eight more knobs on the one message window**, joining the caption block:

| fn | what it does |
|---|---|
| 402 | reads the byte `+0x19b4` into a reference |
| 403 | reads the word `+0x9a0` — the message's own state, which `401` and the end-of-text code both zero |
| 404 | reads **the byte at the window's current text pointer** (`*(u8*)win[0x58]`) |
| 417 | writes `+0x19c0 = 1` and `+0x195d = 0x1e` |
| 418 | writes its number to the byte `+0x19ae` |
| 419 | writes `+0x19ca = 0` |
| 420 | writes `+0x19cb` as a boolean of its number |
| 421 | writes `+0x19c1 = 1` |

**What those bytes mean is not established**, so this engine carries them by
their offsets rather than naming them for a guess, and answers the three
readers with 0 — an idle state and a zero byte for the end of the text, which
is the direction that lets a scene polling one carry on.

**The flag-word switches read the other way up.** `536` takes a kind and a
switch — kind 0 is bit `0x008`, kind 1 is bit `0x400` — and `833` takes the
switch alone for bit `0x800`; in both, **a 0 sets the bit** and anything else
clears it. A set bit in that word *suppresses* a subsystem's update, so a 0
means "hold this still". `581` reads the same way up on the map placement
manager's own word, and `582` clears that bit and bit `0x10000` on every one of
the manager's sub-objects.

That polarity is worth having: it is the same sense `568`'s setup uses on the
same two bits when a scene declares them, which is why the two agree.

**`569` is one line**: `sprintf(context + 0xD8, "data/%s", name)`, putting a ROM
path together in the scene's own buffer. What reads it was not followed.

### One correction

An earlier reading of `417` had it returning the message window's pointer
rather than a success code, on the grounds that it has no `mov r0, #1`. It
does — at `0x0215e90c`, where the 1 it is about to store is loaded — and that
1 is still in `r0` at the `pop`. `417` returns 1 like everything else.

## 5h. Four that were not what their arguments suggested — 23 September 2026

A caution about reading shapes. `238` is handed a number and then three more,
and 172 times across 72 events; the observed signatures are `ifff`, `iiii` and
`iiiii`. That is exactly the shape of `207` and `211`, which walk a character to
a point, so it was read out of the table **as a third member of that family**
and the decomp was asked what made it different.

**It is a palette recolour.** The three numbers are a colour, not a place.

| | `207` / `211` | `238` |
|---|---|---|
| first argument resolves through | `GetEventActor`, ×`0x588` | the **event placement array**, ×`0x10` — a different index space |
| next three read with | `ScriptValueToFloat` | `ScriptValueToInt` |
| and converted by | `_fmul(4096.0f)` then `_ffix` — fix32 world coordinates | `r \| g<<5 \| b<<10`, truncated to 16 bits — **BGR555** |
| queues a command record | yes | **no**, it acts at once |
| touches position | yes | **no** |
| touches texture palette VRAM | no | **yes** |

There is no `_fmul` and no `_ffix` anywhere in `238`, and it never calls
`GetEventActor`. The resemblance was entirely in how the harness reports a
literal's tag. **Shape is a hint about arity, not about meaning** — worth
remembering, because the same trap is waiting under every `(iff…)` on the list.

What `238` actually does: packs the colour, stores an optional fifth number as
a **mode** on the model itself, and hands both to a worker that rebuilds the
model's texture palette into a staging buffer and DMAs it to VRAM. Three modes:
**0, the default, adds** the colour to each entry and holds at 31; **1 fills**,
every entry becoming the colour; **2 multiplies** each entry by the colour over
31. Where the placement is one of the first four game objects the colour goes
to the **whole party member** — the model and twelve object slots beside it, at
`id × 12 + 0x13` and up, INFERRED to be what they wear.

**`236` unhangs** a placement's model: the same array, the same kind filter
(`0`, `1`, `4`, `5`, `6`), the same missing bounds check, and then
`Object3D::Detach` — which clears the two links holding it in its parent's list
of children and sets the bone it hung on to −1, and, if it is itself the
anchor, walks its whole list of children and clears each. Unlike `238` it hands
back **0** on a wrong kind or an empty entry.

**`230` takes a set of motions off a character.** It reads the animation flags
and **the name of what is playing** first, because what comes next clears them;
unloads every animation package with the id it is given — **3 when the scene
does not say, which is every call on the cartridge** — and then sets the same
animation again by name. **If the name no longer resolves it falls back to
`stand`.** That fallback is one this engine already does, since `sceneMotion`
resolves an unknown motion to `stand`.

**`578` fades the scene's light.** A multiplier — `1.0` normal, `0` black —
over a count of **frames**, which the handler turns into milliseconds by
multiplying by the frame's own length; **0, or no second number, sets it
outright**. It reaches one scale over the scene's two light colours and the
horizon's inner and outer colours, each scaled channel by channel, interpolated
in float. This engine tints by one overlay rather than scaling the lights, so
that is where the scale lands — but it does land, and it shows.

`230` and `578` co-occur in all three of the events that call `578`, which is
suggestive at p ≈ 10⁻³, but **nothing in the code links them**: their only
shared callee is `GameState::GetInstance`. Read as a script idiom, not a
feature.

## 5i. Script chaining, and the end of the worklist — 23 September 2026

### `538` is how a cutscene is cut into pieces

The head of the worklist at 95 events, and it turns out to be **structural**.
It writes one halfword of the scene's context, `+0x11a`. The VM's step, at the
point where a script has run out, looks at that halfword: if a script is
waiting there it **copies it into the scene's event id, re-arms the VM and
answers "not finished"** instead of ending the scene. The context is kept, so
the cast, the camera and the shot carry straight over.

The halfword is cleared when a scene begins and again by the re-arm, so **0
means no chain**. Nothing validates the id.

`834` and `810` are the other two of the three. A trigger record carries **two**
event ids: the first runs, and the second is parked beside the chain at
`+0x11c`. `834` answers whether one is parked — **a 1 or 0, not the id** — and
`810` moves it into the chain.

This engine now honours it: `EventPlayer` takes a loader, and a chain builds a
new run on the **same stage**.

### `521` and `522` are the sprite pair

`521` takes a name, **finds the first free of 32 slots**, and **hands that slot
back through its reference** — which is the whole reason its shape has one. It
loads `data/ani/<name>.spr`, adding the suffix only where the name has not got
one, and stages the texture into a VRAM partition; its optional third number
picks one of eight allocators and its fourth the partition, **27 by default,
which is the very partition `502` and `503` bracket**. Neither is bounds-checked.

**A correction to §5e.** That section called `573` the exact inverse of `521`.
It is not quite: `522` is, taking the same 0-to-31 slot `521` hands back.
`573` does the same teardown on the same manager but is indexed through the
**event placement table** — it reads an entry of kind 2 or 6 and uses that
entry's `slot` field. Two ways in to one destructor. The brief that went out
with this read said `573` reached its manager through `GetCurrentZone`, which
was **my error** — both go through the same accessor.

### The rest

| fn | what it does |
|---|---|
| 228 | copy a model into another slot, scaled by `0x10a` — about a fifteenth of its size, and why is not established |
| 738 | stop the sequence player and put the master volume back to 127 |
| 580 | ease the field of view to a target over a count of **frames**; 0 sets it outright, by calling `532`'s own setter |
| 600 | read a story flag **by its raw bit**, where `603` displaces an id of `0x400` or more by 1,786 — so the bits between the two banks are reachable only through `600`, and the game does use them |
| 509 | switch a **raw 32-bit mask** on a model's own flag word |
| 550, 556 | what a character is holding: `550` shows or hides the weapon and the off hand, `556` re-mounts the weapon from `data/bin/wpnpos.bin` — twelve rows, one a weapon class, each holding two placements |
| 588, 589 | pin the lighting to a time of day: `589` reads the clock, `588` is given the index. Both set the phase and re-tint the zone; **`589` runs once a zone** and a second call does nothing at all |
| 548, 549 | override which lighting a zone uses, and put it back. **`549` reads its one argument and throws it away** |
| 579 | stop and start the day clock — **inverted**: a 0 starts it |
| 226, 227 | set and ease how far a character reaches (`Object3D::radius_`), the exact shape of `219` and `220` over another field. A count of 0 writes nothing at all |
| 598 | who leads the party: the first entry of the array of party object indices |
| 838 | how long the staff roll has run, in milliseconds, from overlay 28's stopwatch |

### `559` writes a byte nothing reads

The clearest negative finding of the phase. `559` writes one byte of the
progress block and returns. **The whole cartridge holds two writers and no
reader** — this, and a map transition that puts `0xFF` back. Every byte and
halfword load that could reach the offset was searched for. There is nothing to
implement and nothing more to find from the binaries.

### Two measures had to be restated

Both went false, and **neither because anything regressed**.

The coverage test held that **most missing functions are wanted by many areas**
— so the first town pays for most of the rest, and the phase's sequencing is
sound. It was true for the whole phase and fell to 0.48. The shared base is
exactly what has been implemented, so what is left is the long tail by
construction: 29 numbers over 75 areas, half of them wanted by a single area.
The premise was cashed in, not disproved.

It also held that **the head of the worklist is wanted by more than twenty
areas**. The head is now `223`, wanted by six. Same reason: the numbers the
earliest scenes and the latest both wanted have all been read, so what is left
at the head is a scene's own.

Both now pin the thing the phase actually rests on — that the remaining work is
small — and the shape of the tail is printed rather than asserted.

## 5j. The lowest ten numbers are the player — 23 September 2026

Found by chasing a runaway rather than by the worklist. Running every one of
the 687 scripts with chaining on, **thirteen run to a 10,000-frame cap** — and
one of them, `ev53174`, spends 9,992 of those frames calling engine functions
**`0` and `2`** and getting 0 back. Those are the two lowest numbers on the
cartridge, and nothing had looked at them.

They are **input**.

| fn | handed | what it does |
|---|---|---|
| 0 | reference | **how many of four buttons are held**, 0 to 4 — it tests `0x0001`, `0x0002`, `0x0400` and `0x0800` separately and adds the answers |
| 1 | mask, reference | whether the buttons in the mask were **newly pressed**: held now and not held last frame |
| 2 | reference | a flag of the input object and a count of its below ten, ANDed — **what those two fields are was not established** |
| 3 | flag | switches something of the loader's on or off, by two calls differing only in which |
| 4, 5 | float, reference | one number of maths apiece, answered through the **float** store — **INFERRED** a sine and a cosine, from the shape alone: one double in, one out |
| 6 | float, float, reference | two in, one float out — **INFERRED** an arc tangent |
| 7 | low, high, reference | **a random number from low to high, both ends included** — `NextRandomBetween` over the battle's own generator, whose body is `low + below(high − low + 1)` |
| 8, 9 | — | set and clear the zone-mask flag, already read |

So **the runaway is not a bug — it is a scene waiting for the player**, which
in a headless sweep never comes. That is worth knowing before anyone tries to
"fix" a script that will not finish: of the thirteen that hit the cap, this one
is explained and the others ask for nothing at all.

`4`, `5` and `6` are **left unanswered on purpose**. Their shape says "one
double in, one out" and "two in, one out", and sine, cosine and arc tangent are
the obvious guesses — but a guess here would put a wrong number into a scene's
arithmetic, and the rule is to leave it. They are counted, not answered.

The buttons are answered from fields the caller fills, which start empty — so a
scene waiting on a press waits, exactly as the game does. Mapping this engine's
keys onto the DS's button bits would be inventing a control scheme, so it is
left to whoever plays the event. The die, though, is wired: a scene's roll comes
from the same generator the wandering monsters use, so it is of a piece with
the rest of a run and the same on every machine.

## 5k. The tail of the 200s, 300s, 500s and 700s — 23 September 2026

### The movement family, finally sorted out

`207`, `231` and `232` queue **the same command** on the same channel and
differ by a mode word:

| fn | takes | what it does |
|---|---|---|
| `207` | character, x, y, z, frames | glide to exactly there |
| `232` | character, **x, z**, frames | glide there, and **take the height from the floor every frame** |
| `231` | character, x, z | the same, at once |

There is no y argument on `231` or `232`: the y the command carries is the
constant `0xa000`, ten, which is only where the downward probe starts. Both
also take an optional motion name played when the move ends — and the game
makes that call whether or not one was given, with an empty name the animation
setter ignores.

This engine now walks a character onto real ground for those two, asking the
same collision world the Hero stands on.

### 317 and 326 are twins that differ in one word

The two handlers are the same instruction for instruction and differ only in
which command they queue. **`317` shakes the eye and the look-at together**, so
the view slides without turning; **`326` shakes the look-at alone**, so the view
turns about where the camera stands. Both run the same four-frame square wave,
and both carry the same dead decay — the amplitude they apply is taken once and
never written again.

This engine keeps an eye derived from a look-at and an orbit, so `326` is done
by working the orbit out afresh from the eye the camera had, which comes to the
same thing.

### `324` never ends by itself

It queues a command that **runs every frame and returns "still going" for ever**:
the camera's look-at becomes the character's position plus an offset. Only
`325` stops it, and all `325` does is clear the character — the command then
frees itself on its next frame.

### The rest

| fn | what it does |
|---|---|
| 223 | show or hide a thing the map placed — **and only when the cast entry is of kind 2** |
| 234 | whether a cast member's animation is still running. **Where the kind carries a model and the model is missing it writes nothing at all**, so the script's variable keeps what it held |
| 239, 240 | hang a model on a placement and take it off. The placement's draw puts it **before** its own model. The two numbers are read differently: the first entry for its *slot*, the second for its *model* |
| 552 | the three-bone camera: two bones drive the eye and the look-at as `572`'s do, and **the third drags a second object about**, turning it to face the way it moved. Its fifth number is that object |
| 557 | let go of whatever the Hero is on — **INFERRED**; the code says only which bit it clears |
| 583 | one byte gating the path that enters a map. Fifteen places read it as a yes-or-no; **one tells 4, 8 and `0x0c` apart** |
| 599, 805 | two render passes of the zone's, each written as **a whole word, not a bit**; a zero skips the pass whole |
| 601, 602 | bits of the **progress record in hand** — the bank opens with five records of 28 bytes, one byte says which is current, and `601` reads that record's bitfield at `+0x03`, `602` its second at `+0x10` |
| 736 | play the zone's own tune: the zone's id through a table of 47, two substitutions that follow the time of day, and an override list whose entries each carry **a story flag to test** |
| 737 | the same whole teardown as `738`, then a tune on the manager's **second** player — the one a jingle uses, leaving the first slot empty so a later tune still plays |

### A fifth function that reads the other way up

`591` sets a zone bit when its number is **0** and clears it otherwise, and
`735` does the same to the bit that makes the sound manager's play and fade
both give up at once. With `536`, `581` and `833` that is **five** in the same
shape: **a 0 means "on"**. It is consistent enough to be the house style rather
than an accident, and worth expecting on any switch still unread.

Neither `591`'s bit nor `559`'s byte has a reader anywhere in the cartridge.

## 5l. The 800 block is the ending — 23 September 2026

The tightest cluster left was `804` with `820`, `821`, `822`, `826`, `811`,
`734` and `845` at 100%. It is not a co-occurrence: **it is the staff roll and
the credit cards around it**, and the scripts name the files.

`ev29350` calls `820` with `chara_sub/toriyama.pac`, `sugiyama.pac`,
`hino.pac`, `fujisawa.pac`; `ev29373` with `ichimura.pac`; `ev29306` with
`chara_sub/tobe_<LG>.pac`. Every one of those exists on the cartridge, beside a
company card and one card per language, and `horii.pac`'s members are literally
`horii_san.bncg`, `.bncl`, `.bnsc` — a `CHAR`, a `PALT` and a `SCRN` chunk, one
full-screen 256-colour picture.

The mechanism, in the order a script does it:

| fn | what it does |
|---|---|
| `734` | re-size the two sound heaps — **non-zero gives the music heap both regions**, zero splits them back, so the ending's theme plays unbroken across the segments |
| `811` | page in the overlay holding the staff roll and start its per-frame task: the credits scroll up the bottom screen's own layer |
| `838` | how long that task has run, **in milliseconds**, so a script keeps its cards in step with a scroll it does not drive |
| `821` | save the whole display state — bank mapping, four layer registers, which layers are on |
| `820` | put a `.pac`'s picture on the top screen's fourth layer, every other layer off |
| `826` | blank that layer between cards |
| `822` | put the saved state back |
| `812` | stop the roll and page the overlay out |
| `804` | **fog off and on** around all of it |

**`804` is not inferred.** The decomp's own hand-written C++
(`src/Graphics/LightingManager.cpp:818`) makes the identical call,
`func_020c54a4(true, fog->type, fog->depthShift, fog->offset)`. It is the
broadest of the block — 35 events — because it brackets *any* such takeover of
the screen, which is why everything else sits inside it.

**`845` is not part of it.** It is the middle of a different set: `506` opens a
preload batch, `845` tops it up, `507` waits. It shares `804` for the same
reason 124 other scripts share `506` — preloading precedes anything that
repaints the screen.

### `845` has a slip, and this copies it

Its loop runs from the batch's **running count** up to the **argument count**,
but reads from the **first** argument each time. So it queues `argc − count`
files, reading the first `argc − count` arguments and leaving the last `count`
read by nothing — and where the batch already holds as many files as the call
has arguments, it does nothing whatever. `506`, its sibling, resets the count
first and so never trips over this.

### `815` is an anti-tamper check

Worth saying plainly. It writes **1** through its reference *before anything
else*, pages in an overlay whose code is obfuscated, calls three of its entry
points through three stubs and compares each answer against a constant; each
stub also bumps a counter by 1, 2 and 3. Only if all three match **and** the
counter reaches 6 does it go back and write **0**.

So **0 is the good answer**, 1 means tampered-with or not checked, and the 1 is
written first so a check cut short leaves it. Its second argument is the
"really check" switch and must be exactly 1.

### `823` writes nothing where the bit is clear

Like `234`'s missing model: where the flag it tests is clear it **writes
nothing at all**, so the script's own variable keeps what it held. Only where
it is set does it store, and what it stores is always 1.

### `803` is a third kind of camera shake

Not `317`'s or `326`'s queued square wave: a **continuous sine**. The camera
keeps a phase that advances by the frame's length times a speed, looks the sine
up in a table, scales it by an amplitude and adds the result to the eye's and
the look-at's **height only**. `803(0)` turns it off. Its second number stays a
**plain float** while its third is scaled by 4,096 — two different kinds of
number that the shape `(i, f, f)` hides completely.

### `828` and `829` are the equipment pair

Proved three ways, none circumstantial: they are the only two numbers that
touch one flag bit; that bit is what lets the model-rebuild queue run at all;
and the node type `829` waits on is the one `828`'s request is built with.
`828` stashes what is in a slot and empties it, or puts the stash back, then
asks for the wearer's model to be rebuilt; `829` answers **1 while that request
is still queued**. Equipment drawn on a character is in the slice, so this is
kept against the wearer.

### A correction `808` forced

`808` is `GameState::SetTimeOfDay`, and the decomp's own header gives the enum:
**night 0, morning 1, day 2, evening 3**. `597` answers that same field and
`588` pins it — so all three speak the game's four phases.

This engine was handing `597` its *own* three-way numbering (day 0, evening 1,
night 2), which is the numbering a zone's monsters are picked by and nothing to
do with the lighting. Every scene that asked got the wrong answer, and day and
night were exactly swapped. Now mapped properly; there is no morning here, and
the day's stretch covers it.

### Out of scope, and flagged rather than done

`806` writes one byte of a **grotto** object embedded in the zone. Grottoes are
out of Slice 1, so it is answered and nothing is done.

## 6a. The worklist — what to read next, and in what order

**Phase 1's first step, 23 September 2026.** An engine function the host has
not got is answered with 0 so that a scene goes on rather than stopping dead.
That is the right answer and the wrong thing to be quiet about, so the host now
**says so where it happens**: `EventStage.unread` keeps each one with what it
was handed — the signature, a few argument lists, the frame — tells
`onUnread` the first time each number turns up, and `strict` turns it into a
`ScriptError` for a run whose business is finding them. The game puts the
first sighting on the status line as the scene plays, and names what the scene
wanted when it ends.

`apps/game/test/event-coverage.test.ts` runs **every event any area's triggers
can reach** and prints the worklist two ways: by how many areas want a
function, and **in the order the story wants it**. The story order is the
earliest stage of any trigger that reaches an event, and then the event's own
number — the stage alone says little, since a trigger's span nearly always
starts at 1.1, and the numbering runs with the story.

**What the first scenes want**, as of this writing: `ev01130` alone wants
**222, 532, 543, 554, 595, 596, 728 and 731**, each of them wanted by more
than twenty areas. 554 and 532 are the two most-called of all — 2,416 and
1,653 calls — and take one integer apiece. That is where reading out of the
decomp pays for itself soonest.

**What it looks like when one lands.** Three clusters came out of the table in
one day, each visible in it before anything was read — numbers that turn up
side by side in the same towns are usually one feature.

| cluster | what it was | the slice's own | the towns together |
|---|---|---|---|
| — | where it stood | 78 | 48 |
| 214–217 | a character's waypoint path | 78 | 44 |
| 532 | the scene's field of view | 77 | 44 |
| 502–508, 203, 205, 212 | staging a scene's cast | 69 | 44 |
| 9, 218, 540, 543, 544, 563, 597, 800 | C02's own seven, and a sibling | 68 | 35 |
| 317, 301, 305, 306 | the camera's shake, and its moves | 62 | 32 |
| 554, 728, 731, 726, 730, 732, 712, 222, 595, 596, 545, 546, 541, 542, 561 | sound, and the rest of the head | 55 | 30 |
| 105, 120, 211, 233, 322, 328, 547, 558, 573, 574, 603, 703–709, 715, 721 | the worklist head, and the towns' shared set | 48 | 21 |
| 100–122, 575–577 | the whole brightness block, the display swap, the screen colour, and `574`'s siblings | 37 | 19 |
| 568 · 409–414, 401 · 713, 714, 716–719, 724, 725, 801 · 213, 327, 512, 531, 572, 587 | four clusters read at once | 24 | 17 |
| 402–404, 417–421, 536, 569, 581, 582, 833 | what those four gave away for nothing | 21 | 14 |
| 230, 236, 238, 578 | four that were not what their arguments suggested | 17 | 14 |
| 538, 810, 834 · 521, 522, 228, 738 · 580, 600, 509, 550, 556, 598, 559 · 588, 589, 548, 549, 579, 838, 226, 227 | the last four clusters, script chaining among them | **4** | **9** |

| 223, 231, 232, 234, 239, 240, 324, 325, 326 · 552, 557, 583, 591, 599, 601, 602, 735, 736, 737, 805 | the tail of the 200s, 300s, 500s and 700s | **3** | **3** |

| 734, 802, 803, 804, 806, 808, 809, 811, 812, 815, 820–823, 826, 828, 829, 845 | the 800 block: the ending's staff roll and credit cards | **0** | **2** |

The count of what is unanswered across the cartridge went 150 to **5**, and
what the host implements 36 to **226**.

**The slice's own area wants nothing at all** — 49 events, every engine
function they call answered. **Six of the eight towns want nothing either.**
The head of the story-ordered list has walked off the end of the slice and most
of the way through the game: `ev01130`, `ev01150`, `ev01515`, `ev02500` — the
Hexagon, the slice's last scene — then `ev05200`, and now `ev23189`.

What is left across the whole cartridge is **five numbers**: `807`, `837`,
`843`, `839` and `844` — and nothing the slice ever reaches. **C02 wants nothing at all** — not one
engine function across twenty events — and the slice's own area wants four.
The head of the story-ordered list has walked the whole slice: `ev01130`,
`ev01150`, `ev01515`, and now **`ev02500`**, the Hexagon, which is the last
scene of the slice.

**One measure had to be restated rather than re-pinned.** The coverage test
asserted that each town wanted at least twice as much the slice wanted too as
it wanted on its own; M03 broke it at 4 of 8. Nothing regressed — what has been
implemented *is* the shared base, so what is left over is town-specific by
construction, and the ratio was bound to fall. The claim now rests on the
absolute number: no town adds more than a handful, where each wanted dozens
when the phase began. The head of the story-ordered list has moved from
`ev01130` to `ev01515`, and its one want is `538`.

**The brightness block came out of the table differently from the others**: not
picked as a cluster, but fallen out of reading one member of it. `120` was the
head of the worklist, and reading it exposed a dispatcher that answered
seventeen more numbers — among them `107` and `117`, which were the second and
third most-wanted on the whole cartridge. Reading one function of a mechanical
block is worth more than reading three scattered ones.

## 7a. The text markup, and where the game keeps its own list of it — 24 September 2026

A message is not plain text. It carries tags — `<Cap>`, `<PAGE>`, `<HERO>`,
`<IF_MALE>` — and `apps/game/src/talk.ts`'s `runLine` renders them, keeping
whatever it could not make sense of so the game can say `not shown: <TAG>` on
its status line. That question had only ever been asked one message at a time,
by whoever happened to be looking.

`apps/game/test/text-coverage.test.ts` asks it of all of them.

**5,157 texts across 687 events** — the plan's figure of 1,646 is a third of
the real number. Of those, **nine render to nothing at all**, which would
normally be worse than a missing tag: the player gets a blank box and nothing
says why.

Having looked at which nine, **not one of them is a fault.** Eight are the
same string in the quest events `ev50160`–`ev50224`:

```
<PAD_WAIT_NOCUR></QUEST><CLOSE>
```

— all control and no words, by construction. The ninth is `ev28792`:

```
<ALL_RECOVER=0,0,999>
```

which is not a text at all. **It is an action carried down the message
channel** — the party healed by something written where a line would go — and
it is the first sign that the markup is not only formatting. What the three
arguments are is not established.

So the number to watch is not nine going up but a *tenth kind* appearing,
which is why the test now prints the offenders beside the count.

**Twenty-three tags are unread**, and one of them is most of the problem:

| tag | events | uses |
|---|---|---|
| `<ADD>` | **429** | **1,724** |
| `<PAD_WAIT_NOCUR>`, `</QUEST>` | 94 | 115 |
| `<QUEST_HAN>` | 52 | 52 |
| `<QUEST>` | 50 | 51 |
| `<TIME>` | 44 | 44 |
| `<CEN>` | 43 | 166 |
| `<ME_008>` | 32 | 33 |
| `<ALL_RECOVER>` | 16 | 16 |
| the rest | 1–16 each | |

`<ADD>` alone is in **429 of the 687 events**. Whatever it does, it is the
cheapest thing on the list to read next.

### The game keeps its own vocabulary, and it is 127 tags

At **`0x020f0600`–`0x020f0a00`** in the ARM9, as plain strings. Every one of
the twenty-three above is in it, so none of them is a misparse:

```
WH= ST= LB_ XR= JP_ /XR NO> XY= val_ END> ART_ EXC> VAL_ HERO ACC_ DEF_
SGL_ GEN_ DAT_ PLR_ QES> NOM_ YES> UKE> ADD> STR_ YAME> <INN= <SHOP TURN=
TIME= SIZE= ACTOR PAGE> AUTO= PAD_T= CLOSE> SHAKE> /TITLE YESNO> NOYES>
<BANK> RENKIN LEADER QUEST= INDEF_ I_NAME M_NAME TARGET ACTION REFLEX
WIN_ON> CEN_ON> /QUEST> N_TURN> R_TURN> TURN_P> PAGE_T= WIN_OFF> CEN_OFF>
<CHURCH= UKEYAME> TMAP_SEC PAD_WAIT> QUEST_SE> ADDRESSEE QUEST_HAN>
END_R_TURN> ALL_RECOVER= YESNO_NOTSE> QUEST_FAILED> PAD_WAIT_NOCUR>
YESNO_NOTSE_IIE> <VOICE_VOLUME= <ME_ <SE_ <N_TURN> <EXC> <QES> <RECT=
<WIN> <CEN> <GYOU= <MOJI= <COLOR= <SKIP> <PAGE>
```

**The parser that dispatches them is at `0x0206a6b0`**, a chain of prefix
comparisons through `func_020d85dc`. Two are already read from it, and they
tie the markup to the engine functions:

- **`<WIN>` writes `win+0x19b1 = 0`** — which is exactly what engine function
  **`410`** does. The tag and the opcode are two ways to the same thing, and
  §5f's caption block is the rest of that family.
- **`<CEN>` writes `win+0x19b8 = 1`** — a different byte, and the table's
  `CEN_ON>` / `CEN_OFF>` pair suggests it is a switch rather than a one-shot.

`<GYOU=`, `<MOJI=` and `<COLOR=` follow in the same chain, and reading it
through gives the rest. All three are Japanese words for what they set, which
is a useful reminder that the names are the authors' and not the localisers':

- **`<GYOU=n>`** — 行, *line*. `win[0x9a4] = max(n, 1)`. How many lines the box
  has.
- **`<MOJI=w,h>`** — 文字, *character*. `win+0x1000[0x860] = w` and `[0x864] =
  h`, **defaulting to 12 and 16** when either is given as zero or less. A DS
  font cell.
- **`<COLOR=…>`** — each component parsed as decimal and clamped to `0`–`255`,
  a negative one coming out as `255`.

None of the three is used by the cartridge's event text, so none is on the
worklist; they are recorded because the chain had to be read anyway and
because the defaults are the kind of thing that is expensive to rediscover.

### The tags are a source form: they compile to two-byte codes

There is a **second** parser, and it is a table rather than a chain. Every one
of the eight tags the coverage test could not read — `<ADD>`, `<N_TURN>`,
`</QUEST>`, `<QUEST=`, `<SHAKE>`, `<TIME=`, `<CEN_ON>`, `<WIN_ON>` — is
referenced from one contiguous stretch of `0x020e7f9c`–`0x020e80bc`, which is
what a dispatch table looks like and what scattered special cases do not.

It is **40 entries of `{const char* tag, int (*handler)(…)}` at `0x020e7f84`**,
running to `0x020e80c4`. Each plain handler has the same nine-instruction
shape — load a 16-bit literal, `memcpy` two bytes to the output, return 2:

```
0206980c  push {r3, lr}          ; <ADD>
02069810  ldr  r0, [r0]
02069814  ldr  r3, [pc, #0x14]   ; → 0x02069830 = 0x0000ff0a
02069818  add  r1, sp, #0
0206981c  mov  r2, #2
02069820  strh r3, [sp]
02069824  bl   #0x2001a40        ; memcpy
02069828  mov  r0, #2            ; bytes written
0206982c  pop  {r3, pc}
```

So **the ASCII is a source form**: an authored `<ADD>` becomes the halfword
`0xFF0A`, and what the tag *means* lives in whatever reads that code, not here.
That is why the tag's name is no evidence of its behaviour — a point worth
holding onto, because several of these names invite a guess.

Read out of the table, handler by handler:

| tag | handler | code | tag | handler | code |
|---|---|---|---|---|---|
| `<END>` | `0x02069f74` | `0xFF01` | `<YAME>` | `0x02069f4c` | `0xFF17` |
| `<END_R_TURN>` | `0x02069e0c` | `0xFF02` | `<PAD_WAIT>` | `0x02069884` | `0xFF1D` |
| `<CLOSE>` | `0x02069f9c` | `0xFF03` | `<PAD_WAIT_NOCUR>` | `0x020698fc` | `0xFF1F` |
| `<YESNO>` | `0x02069ae4` | `0xFF04` | `<WIN_ON>` | `0x02069924` | `0xFF26` |
| `<NOYES>` | `0x02069b0c` | `0xFF05` | `<WIN_OFF>` | `0x0206994c` | `0xFF27` |
| `<YESNO_NOTSE>` | `0x02069b34` | `0xFF06` | `<CEN_ON>` | `0x02069974` | `0xFF28` |
| `<YESNO_NOTSE_IIE>` | `0x02069b5c` | `0xFF07` | `<CEN_OFF>` | `0x0206999c` | `0xFF29` |
| `<UKEYAME>` | `0x02069b84` | `0xFF08` | `<N_TURN>` | `0x02069de4` | `0xFF2B` |
| `<ADD>` | `0x0206980c` | `0xFF0A` | `<R_TURN>` | `0x02069e34` | `0xFF2C` |
| `<PAGE>` | `0x02069790` | `0xFF0D` | `<TURN_P>` | `0x02069e5c` | `0xFF2D` |
| `<SHAKE>` | `0x02069fc4` | `0xFF0E` | `<EXC>` | `0x02069e84` | `0xFF2E` |
| `<QUEST_SE>` | `0x02069ce0` | `0xFF0F` | `<QES>` | `0x02069eac` | `0xFF2F` |
| `<QUEST_HAN>` | `0x02069d6c` | `0xFF11` | `<YES>` | `0x02069ed4` | `0xFF14` |
| `</QUEST>` | `0x02069dbc` | `0xFF12` | `<NO>` | `0x02069efc` | `0xFF15` |
| `<QUEST_FAILED>` | `0x02069d94` | `0xFF13` | `<UKE>` | `0x02069f24` | `0xFF16` |

The remaining eight — `<PAGE_T=`, `<AUTO=`, `<TIME=`, `<PAD_T=`,
`<ALL_RECOVER=`, `<ST=`, `<TURN=`, `<QUEST=` — take an argument and have
longer handlers, and **their encoding is not yet read**. They are the ones
ending in `=`, which is how the compiler tells them apart.

**`<LB_x>` and `<JP_x>` are a range, not a prefix.** Their handlers
(`0x02069bac`, `0x02069be4`) read the single character after the underscore,
subtract `0x40` — the character before `A` — and add it to a base:

```
02069bb0  ldrsb r1, [r1]         ; the letter
02069bb4  ldr   r2, [pc, #0x24]  ; → 0x02069be0 = 0x0000ffd0
02069bbc  sub   r1, r1, #0x40
02069bc4  add   r3, r2, r1, lsr #16
```

So `<LB_A>` is `0xFFD1` and `<JP_A>` is `0xFFE1`, and a label is **one letter,
`A` to `O`** — sixteen slots each, of which the letter form can reach fifteen.
`runLine` pairs them by name and so is unaffected, but it pins the limit.

### The compiler, and how an argument is carried

The loop that does all this is at **`0x0206a020`**, and reading it settles
several things at once. It walks the authored string a character at a time:

- **`\n`, CRLF and a bare LF all compile to `0xFF18`.** That is the line
  break, confirmed three ways in the one function. It also **corrects an
  earlier reading here**, which had the line-count scan at `0x0206b6b8`
  stopping on `0xFF01`/`0xFF0B`/`0xFF0C` and counting `0xFF17`. Read from the
  bases rather than recalled, that function loads `0xFF01` and forms
  `r6 = +0xB`, `r5 = +0xC`, `r4 = +0x17` — so it stops on `0xFF01` (`<END>`),
  `0xFF0C` and `0xFF0D` (`<PAGE>`), and counts **`0xFF18`**, the newline.
  Every one of the four was off by one.
- On `<` it finds the matching `>` and walks the table at `0x020e7f84`,
  prefix-comparing with `func_020d85dc` and calling the handler with the output
  pointer and the text just past the tag name. The handler's return value is
  how far the output moved — which is why every plain one returns 2.
- **Five tags are dropped on the floor.** If no table entry matched, a second
  list at `0x020e7e74` — `<INN=`, `<CHURCH=`, `<BANK>`, `<SHOP`, `RENKIN` — is
  compared, and a match causes the compiler to scan past the `>` and emit
  *nothing*. So the services never reach the window at all; something upstream
  reads them from the source. `talk.ts` reads them off the tokens, which turns
  out to be the same arrangement.

**What those codes reach, read 25 September 2026.** `func_0206f6cc` is the one
function the talk service (5) calls for a facility, and it switches on the
code byte through a table at `0x0206f70c`:

```
0206f6fc  ldrb  r1, [r5, r4]           ; the facility code out of the message
0206f700  cmp   r1, #0xc
0206f704  addls pc, pc, r1, lsl #2     ; so code n is at 0x0206f70c + 4n
```

| code | begins | what |
|---|---|---|
| 1 | `0x21bac24` | the inn |
| 2 | `0x21ba8e0` | the church |
| 3 | `0x217e300` | the bank |
| 4 | `0x21b2c24` | the shop |
| 5, 8 | `0x21b65e0` | Patty's party planning (modes 0 and 1) |
| 6, 12 | `0x218d77c` | the Quester's Rest counter |
| **7** | `0x21b146c` | **the Krak Pot** |
| 9, 10 | `0x21c12fc` | Alltrades (modes 0 and 1, the second being revocation) |
| 11 | `0x21a8614` | the Starflight Express |

Only five of those have a text tag in the list above, so the other flows are
begun some other way and **where their code comes from is not established**.

`<RENKIN>` is read as a service by `apps/game/src/talk.ts` now. It is bare —
there is one pot — and it appears both as a line of its own and as
`…<END><RENKIN>`.

**An argument is not encoded in the stream. It is put in a slot, and the code
carries the slot.** `<VOICE_VOLUME=n>` is the clearest case:

```
0206a1b0  bl   #0x2005a94          ; atoi, past the 14 characters of the name
0206a1d8  strb r0, [r1, #0x94a]    ; → win + 0x1000 + 0x94a + slot
0206a1dc  add  r0, r6, #0x4d
0206a1e0  add  r3, r0, #0xff00     ; the code is 0xFF4D + slot
0206a210  and  r6, r0, #3          ; and the slot rotates, four deep
```

So four voice volumes can be in flight in one message, at codes `0xFF4D`–
`0xFF50`, and a fifth overwrites the first. That is very likely the mechanism
the eight `=` tags use too, but **only `<VOICE_VOLUME=` has actually been
read**; the others are still open.

Two more come out of the same stretch, and they close the `<ME_>`/`<SE_>` line
of the worklist:

- **`<ME_nnn>` → `0xFF34 + n`**, the number parsed as decimal from the three
  characters after the underscore (`add r0, r0, #0x334` then `add r3, r0,
  #0xfc00`). A jingle, played where it stands.
- **`<SE_nnn>` → `0xFF4B`**, and the number is looked up in a list held at
  `0x020e7e04+0x24`. That list is **one entry long — `14`** — with `0xFFFF`
  after it as a terminator, and the cartridge's text uses `<SE_014>` and
  nothing else. The compiler and the content agree exactly.

`runLine` reads both as `SoundCue`s rather than text, which is what they are:
they come *out* of the line instead of going into it.

**And the number in the tag is not the sound.** This was got wrong here for
half a day and caught by running the witness over Gleeba, which reported
`no effect 14 in the sound archive` on one of forty views. The interpreter's
arms say what is actually asked for:

```
02066860  ldr  r1, [sp, #0x64]    ; 0xFF34 — the <ME_ range
0206687c  bl   #0x2045688         ; stop the typing sound
02066884  ldr  r1, =0xffff00fd    ; −0xFF03
0206688c  add  r1, r2, r1         ; id = code − 0xFF03
02066890  bl   #0x209c830         ; a jingle request
...
020668bc  ldr  r1, =0x0000ff4b    ; the <SE_ code, and there is only the one
020668d8  mov  r1, #0xe           ; …answered with a flat 14
020668e0  bl   #0x205eaa0         ; a different call — the one <EXC>/<QES> use
```

So **`<ME_n>` asks for `n + 49`**, and `<ME_008>` means 57. And `<SE_n>`'s
number never reaches the runtime at all: the code is always `0xFF4B` and the
answer is always 14.

**What that id space is has not been read.** It is not this host's:
`playEffect` takes an index into the effect archive's SSAR records and the
cartridge has no record 14. So the cue is carried and nothing plays it.
Playing the archive's fourteenth effect because the game asked for sound 14
would be exactly the invented mapping this file exists to prevent — it would
have appeared to work, and quietly played the wrong sound for ever.

### One inference the codes settle

`talk.ts` reads `<UKE>` and `<YAME>` as accept and decline, and says so as an
`INFERRED` from the Japanese and from the system strings' ordering. The codes
are better evidence than either: **`<YES>` `0xFF14`, `<NO>` `0xFF15`, `<UKE>`
`0xFF16`, `<YAME>` `0xFF17`** are four consecutive values in the order their
two prompts introduce them — `<YESNO>` then `<UKEYAME>`. The compiler was
built round the pairing, so it is not a reading of the text any more.

### What the codes do

Read from the interpreter, not from the names. The interpreter is the message
state machine at **`0x02065990`–`0x02066a60`**, and the reason a search for
these constants finds nothing is that **it loads one literal — `0xFF4B` at
`0x02066958` — and derives every comparand by subtraction.** Anyone looking
for `cmp rX, #0xff0a` will conclude the code is dead.

**`<ADD>` `0xFF0A` — the commonest tag on the cartridge, and not what it
sounds like.** 429 of 687 events, 1,724 uses. Its arm at `0x02066048`:

```
02066054  mov r1, #3
0206605c  str r1, [sl, #0x9a0]   ; wait-state 3
02066060  bl  #0x2045688         ; stop the typing sound
02066064  b   #0x2066a5c         ; return WITHOUT advancing the cursor
```

Nothing else in the ARM9 writes state 3. The payoff is at `0x0204513c`, where
the next `ShowMessage` branches on it: state 3 takes the **append** path at
`0x02044f3c`, which sets a continuation flag and rebuilds the text *without*
the teardown the normal path does. So **`<ADD>` ends a message and leaves the
window standing, so the next one is drawn into it.** It is punctuation between
messages, not anything in the text — which is why it was invisible.

**`<N_TURN>` `0xFF2B` is not a turn.** It is the second-commonest through NPC
dialogue — 208 uses — and the compiled code has *no consumer anywhere*. It is
handled as ASCII instead, in the prefix pass at `0x0206a3c0`, whose prologue
runs before it looks at a single tag:

```
0206a3cc  mov  r0, #1
0206a3e0  strb r0, [r2, #0x9b6]   ; a turn IS pending
0206a3e4..0206a45c                 ; atan2(player − npc)
0206a460  str  r0, [r1, #0x844]    ; target = face the player
```

**Every message turns the speaker to face you.** The tags only override that,
and `<N_TURN>` is "no turn":

```
0206a498  ldr  r2, [r0, #0x83c]   ; the facing saved when the talk opened
0206a4a0  str  r2, [r0, #0x844]
0206a4a4  strb r1, [r0, #0x9b6]   ; r1 = 0 — flag CLEARED
```

The rest of the family, from the interpreter: **`<TURN_P>` `0xFF2D`** faces the
party leader by the same `atan2`; **`<R_TURN>` `0xFF2C`** returns to the saved
facing and makes the box wait for the rotation; **`<END_R_TURN>` `0xFF02`**
does what `<END>` does *and* restores the facing without waiting;
**`<TURN=n>` `0xFF2A`** is an absolute angle, `n × 4096` — fx32 radians, which
agrees with §5's finding that engine angles are radians.

**`<EXC>` and `<QES>`** are the balloons over a head. Both write `60` to
`+0x959` and `1` to `+0x9b7`; they differ in one byte at `+0x95c` — 0 and 1 —
and the sound asked for, 6 and 28. Sixty frames is a second.

**`<SHAKE>` `0xFF0E`** shakes the **message window**, not the screen and not
the text: `+0x19c0 = 1`, `+0x195d = 30` frames, and the offset comes from two
four-byte tables at `0x020e7e10` and `0x020e7e1c` stepped on `timer & 3` —
x = `{−2, 0, 0, 0}`, y = `{0, 0, −3, 0}`. Hardcoded; no operand.

**`<TIME=n>` `0xFF1A`** is a pause of `n` ticks, decremented once per
interpreter tick and holding the cursor on the code until it reaches zero. It
is not a typing speed — that is `<AUTO=n>` `0xFF0B` and `<PAGE_T=n>` `0xFF0C`.

**The quest family** acts on a quest bound by `<QUEST=n>` `0xFF10`, whose
number the compiler turns into an index into a 204-entry active-quest list and
stashes; the interpreter copies it onto the window. `<QUEST_HAN>` `0xFF11` and
`<QUEST_FAILED>` `0xFF13` open a banner by identical code differing in one bit
and a sound id; `</QUEST>` `0xFF12` closes it; `<QUEST_SE>` `0xFF0F` writes a
packed word per quest and asks for the fanfare. **What `HAN` abbreviates is
not established**, and neither is what the banner draws.

**`<ALL_RECOVER=a,b,c>` `0xFF1B`** is the gameplay action found earlier as a
blank text: two flags at `+0x19c6`/`+0x19c7` and a count at `+0x187e`, handed
to an overlay. **What the two flags select is not established.**

And the parameterised form in general, which one agent established and another
corroborated: **an argument never enters the stream.** It is parsed as decimal
at compile time and written into a window field, and the code carries only
enough to find it. The consequence is worth stating because it is a real
constraint on the format: **only the last `<QUEST=n>`, `<AUTO=n>` or
`<PAGE_T=n>` in a message takes effect**, and `<ST=>` has exactly four slots.
Corroboration that nothing is inline: the length helper at `0x0206abf8` gives
a non-zero operand count for `0xFF20`–`0xFF25` and zero for everything else.

### Two things this pass got wrong, and one it could not settle

Recording these because the wrong ones were plausible:

- An earlier note here had the line-count scan stopping on `0xFF0B`/`0xFF0C`
  and counting `0xFF17`. Every one of those was off by one; corrected above.
- One reading offered the table at `0x020e7efc` — `DEF_`, `INDEF_`, `NOM_`,
  `GEN_`, `I_NAME`, `ACTOR`… — as "the sub-table for the `LB_`/`JP_`
  handlers". **It is not.** `LB_` and `JP_` were read here directly and take
  the single letter after the underscore; `0x020e7efc` is a separate
  ASCII-to-ASCII substitution pass walked from `0x02069234`, which is also why
  its `0xFF04`–`0xFF09` values do not collide with `<YESNO>`…`<UKEYAME>`.
  A neat-looking adjacency in memory is not a relationship.
- **`0xFF20`–`0xFF25` are emitted by nothing** in the ARM9 or any of the
  overlays. `0xFF20` sets the running x to at least its operand and `0xFF23`
  advances x by it — absolute and relative horizontal positioning — and the
  other four have no consumer either. An authoring path that is not in this
  build is the obvious guess and it stays a guess.

**Where this leaves the worklist.** Event text went from twenty-three unread
tags to six, and NPC dialogue from fourteen to five. What remains is of a
different kind: `<.|>` and `<.|.|>` are not in the compiler's vocabulary at
all, and `<tmap_sec1>`–`<str_5>`, `<val_2>` are values the engine supplies and
this host has nothing to supply. `<WIN_ON>`/`<WIN_OFF>` are left deliberately:
`<WIN>` writes 0 to the frame byte and the pair obviously toggles it, but
obviously is not read, and this is the file where that distinction is the
whole point.

## 7. Open questions

- What each engine function does, beyond the hundred the host now plays.
  `apps/game/src/event.ts` names the reading beside each; 90 numbers across
  the cartridge are still answered with 0 and counted, and
  `apps/game/test/event-coverage.test.ts` prints them in the order the story
  wants them. Of the morning's own 21, only 509, 589, 713, 714, 724 and 725
  are left.
- What starts the morning. No trigger names it; a new game plays it.
- The order the sections run in, and whether 300 runs after 100 or beside it.
- `0x0E` 42–45, `0x12` and `0x19` beyond the cases seen.
- Header words `+0x10`..`+0x37` of a routine, and `+0x18` of the file.
- What scopes other than 1, 8 and 64 exist, if any.
- The 19 events that wait on answers.

## 8. Where it lives

- `packages/game-formats/src/script.ts` — `readScript`: the file, sections,
  routines, instructions, strings. Synthetic tests in
  `packages/game-formats/test/script.test.ts`.
- `apps/game/src/event.ts` — the game's side: `EventStage`, the engine
  functions it reads, and `EventPlayer`, which runs a script a frame at a time.
  `apps/game/src/actors.ts` reads the look of the characters an event names.
  Synthetic tests in `apps/game/test/event.test.ts`; the morning on a real
  cartridge in `apps/game/test/opening.test.ts`.
- `packages/script/src/vm.ts` — the machine. Synthetic tests in
  `packages/script/test/vm.test.ts`, which build routines in code, labels and
  all.
- `tools/harness/test/scripts.test.ts` — the whole cartridge, local only.
