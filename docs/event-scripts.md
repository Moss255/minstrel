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
| 101 | 612 | 368 | `i` | — |
| 102, 103, 105, 107, 112, 114, 116, 117, 119 | 3–114 | | `i`, `ii`, `iiii` | — |
| 120, 121 | 362, 563 | 328, 444 | `i` | — |
| 204 | 78,948 | 7 | `ir` | whether character N is still walking or turning; polled |
| 206 | 1,600 | 418 | `ifff` | put character N at x, y, z, in the map's units — the morning puts the Hero in the bed of `M01M10` and at its side |
| 207 | 1,445 | 304 | `ifffi` | walk character N to x, y, z over n frames, facing the way it goes — the morning's Erinn goes round the wall to the bedside |
| 208 | 1,526 | 413 | `iifi`, `iiii` | set character N's rotation: x, y, z in radians; the y is the facing |
| 209 | 1,049 | 257 | `iifiii` | turn character N to a rotation over n frames |
| 210 | 3,580 | 520 | `is`, `isi` | play character N's motion by name, with flags |
| 221 | | | `iii`, `iiii` | turn character N to face character M over n frames, the short way — INFERRED: of 45 calls in the 49 Angel Falls events played, the two are never the same character, and of the 22 that find both placed, 17 find N facing elsewhere. The morning's `221 1 0 5 0` turns Erinn to the Hero after she has walked to the bed; `ev02210`'s `221 1 0 5 1` turns Ivor back to the Hero at the side of Erinn's house. The fourth value, 0 or 1 or missing, is not read |
| the other 200s: 211, 214–220, 222, 223, 226, 227, 232, 234, 235, 238–240 | 2–950 | | | — the cast; 219 (`ii`, 950 calls) and 216 (`ifff`, 713) the busiest |
| 224 | 451 | 196 | `is`, `isi` | — a second motion, named after a looping one: the morning's `cyotto_loop` is followed by `224 … "stand"`, so perhaps the motion to go back to |
| 300 | 1,016 | 477 | `-` | — first in a scene, before 303 and 310; played as letting the camera go |
| 301, 302, 304, 306, 311, 317, 321, 322, 324, 327, 328 | 3–142 | | | — the camera |
| 303 | 892 | 366 | `fff` | where the camera looks: the morning's (2.03, 1.56, −0.87) is between the bed and Erinn's walk |
| 310 | 895 | 366 | `fff` | where it looks from: a yaw, then how far up and how far back — the morning's `0, 7.62, 12.71` is 31° down, the pitch of the game's own field camera |
| 400 | 23,119 | 462 | `i` | **show message n** — handed the event's own message numbers |
| 401, 410, 411, 413, 414, 417 | 1–32 | | `-` | — |
| 405 | 241,319 | 462 | `r` | whether the message is still up; polled |
| 509, 512 | 23, 36 | | `iii`, `ii` | — |
| 532 | 1,321 | 518 | `i` | — handed 15 and the like; a fade? |
| the other 500s, from 536 to 599 | 1–582 | | | — the event and the screen |
| 554 | 22,235 | 373 | `i` | — handed the message routine's second value |
| 558 | 4,022 | 39 | `r` | — polled |
| 560 | 252 | 112 | `r` | — its answer chooses between two messages |
| 566, 567 | 2,303, 453 | 522, 218 | `ii`/`isi`, `si` | — the event's options, in section 200 |
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

## 7. Open questions

- What each engine function does, beyond the handful above. The game's host,
  `apps/game/src/event.ts`, plays the ones in the table with a reading; the
  morning, `ev02130`, calls 21 more — 9, 101, 120, 121, 221, 509, 532, 540,
  554, 570, 571, 589, 595, 713, 714, 720, 721, 724, 725, 727, 731 — which it
  answers with 0 and counts. Nothing the morning shows waits on them.
- Where the DS's camera sits for 303 and 310: the eye is read as the target
  plus a yaw, a rise and a run, but how much of the room that shows depends on
  a field of view not yet read.
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
