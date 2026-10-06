# Task 18 — the abilities' and spells' handlers

Read 6 October 2026 from the USA build's overlays 0 and 24 and the ARM9, with
the decomp's symbols and relocations (`~/Projects/dqix-decomp`). Addresses are
the USA build's; the overlays' are shared with the EU cartridge.

## 0. Where it stood

Measured before any change, over every action the 26 skill trees teach and
every spell the six starting vocations learn (`apps/game`'s `battleListsOf`,
as the battle offers them; 181 actions, eight of them not usable in battle):

| how the battle played it | count |
|---|---|
| a spell — heal or harm, `battleSpellOf` | 38 |
| a blow by a read handler, `blowOf` | 49 |
| a blow on slot 0 — played as the plain blow, its rider or own code dropped | 17 |
| Psyche Up | 1 |
| **struck as the Attack** | **76** |

## 1. The kind table — what an action does, by its kind

The resolver calls one handler per target by the action's **kind** (`+0x18`
bits 5–11): 81 pointers-to-member of 8 bytes at `data_ov024_021ff508`, read
by the resolver's one call through it. Each handler is handed the battle,
the actor, the target, the action's record and — on the stack — **whether
the action landed**, which is the accuracy roll's answer
(`func_ov000_02156648`). Every handler of a change makes no draw of its own;
the chance of a change is the accuracy.

The actions the battle offers the party, by kind (slots 30, 34, 59 and 60 are
empty):

| kind | handler | the party's actions on it |
|---|---|---|
| 0 | `func_ov024_021da670` | Counter Wait, Defending Champion, Back Atcha, Whipping Boy, Forbearance, Selflessness |
| 1 | `func_ov024_021da9e0` | Frizz, Frizzle, Kafrizz, Crack, Crackle, Kacrack, Woosh, Swoosh, Kaswoosh, Bang, Boom, Kaboom, Dragon Slash, Metal Slash, Miracle Slash, Falcon Slash, Gigaslash, Gigagash, Mercurial Thrust, Cattle Prod, Pressure Pointer, Thunder Thrust, Multithrust, Lightning Storm, Toxic Dagger, Fly Swat, Victimiser, Assassin's Stab, HP Hoover, Persecutter, Beelzefreeze, Hypnowhip, Lashings of Love, Hit the Hay, Trammel Lash, Schadenfreude, Twin Dragon Lash, Serpent's Bite, Deliverance, Party Pooper, Crushed Ice, Propeller Blade, Can Opener, Flailing Nails, Hardclaw, Rake 'n' Break, Hand of God, Water Slaughterer, Fan Dango, Helm Splitter, Poplar Toppler, Parallax, Hatchet Man, Axes of Evil, Whopper Chop, Heart Breaker, Penny Pincher, Bagsy Last, Monster Masher, Crackerwhack, Big Banga, Crosscutter Throw, Power Throw, Ooze Bruiser, Starburst Throw, Firebird Throw, Metalicker, Gigathrow, Conjury Conductor, Flutter Disaster, Needle Shot, Rain of Pain, Hallowed Arrow, Shining Shot, Blockenspiel, Stone's Throw, Wind Sickles, Knuckle Sandwich, Multifists, Boulder Toss, Miracle Moon, Body Slam, Morale Masher, Attack Attacker, Hot Lick, Clap Trap, Blind Man's Biff, Double-Edged Slash, Solar Flair, Disco Stew, Wolf Whistle, Autograph, Gold Rush, Critical Claim, Kafrizzle, Kacrackle, Have a Ball |
| 2 | `func_ov024_021db3a4` | Heal, Midheal, Moreheal, Fullheal, Multiheal, Meditation, Omniheal, Caduceus, Hustle Dance |
| 3 | `func_ov024_021db5ec` | Oomph, Blunt, Weakening Wave, Double Up, Gritty Ditty |
| 4 | `func_ov024_021db7c0` | Buff, Sap, Kasap |
| 5 | `func_ov024_021db994` | Accelerate, Acceleratle |
| 7 | `func_ov024_021dbc64` | Squelch |
| 8 | `func_ov024_021dbd84` | Snooze |
| 9 | `func_ov024_021dbf18` | Cock-a-doodle-doo, Sobering Slap |
| 10 | `func_ov024_021dc0b8` | Trip of a Deathtime, War Cry, Pratfall, Roaring Tirade, Disco Tech |
| 13 | `func_ov024_021dc540` | M-Pathy |
| 14 | `func_ov024_021dc700` | H-Pathy |
| 15 | `func_ov024_021dc93c` | Psyche Up, Egg On |
| 16 | `func_ov024_021dced0` | Antimagic |
| 17 | `func_ov024_021dd028` | Whack, Thwack, Kathwack |
| 18 | `func_ov024_021dd278` | Zing, Zing Stick |
| 19 | `func_ov024_021dd534` | Flower Power, Scandal Eyes |
| 20 | `func_ov024_021dd6f0` | Tingle |
| 21 | `func_ov024_021dd828` | Fuddle |
| 22 | `func_ov024_021dd968` | Spooky Aura, Wizard Ward |
| 23 | `func_ov024_021ddaa0` | Insulate, Insulatle, Mind Over Matter |
| 25 | `func_ov024_021dde08` | Tap Dance |
| 26 | `func_ov024_021ddf5c` | Spelly Breath |
| 31 | `func_ov024_021de678` | Bounce, Magic Mirror |
| 32 | `func_ov024_021de770` | Reverse Cycle |
| 36 | `func_ov024_021dec50` | Schizofanic |
| 37 | `func_ov024_021ded48` | Immense Defence |
| 38 | `func_ov024_021dee84` | Care Prayer |
| 39 | `func_ov024_021deff8` | Alma Mater |
| 40 | `func_ov024_021df0f0` | Rotstopper |
| 41 | `func_ov024_021df1e8` | Wave of Relief |
| 42 | `func_ov024_021df284` | Channel Anger, Caster Sugar |
| 43 | `func_ov024_021df454` | Mens Sana |
| 44 | `func_ov024_021df924` | Half-Inch |
| 45 | `func_ov024_021dfe9c` | Eye for Trouble |
| 46 | `func_ov024_021dff3c` | Fire Fource, Frost Fource, Gale Fource, Funereal Fource, Life Fource |
| 47 | `func_ov024_021e00c0` | Feel the Burn |
| 48 | `func_ov024_021e01b8` | Right as Rain |
| 49 | `func_ov024_021e02b0` | Disruptive Wave |
| 50 | `func_ov024_021e0380` | Extreme Makeover |
| 51 | `func_ov024_021e04e0` | Eyes on Me |
| 52 | `func_ov024_021e05fc` | Mercy |
| 53 | `func_ov024_021e07b0` | Soothe Sayer |
| 54 | `func_ov024_021e093c` | Vanish |
| 55 | `func_ov024_021e0a50` | Mist Me |
| 56 | `func_ov024_021e0b48` | Whistle |
| 63 | `func_ov024_021e1028` | Twocus Pocus |
| 64 | `func_ov024_021e1120` | Holy Impregnable |
| 66 | `func_ov024_021e1328` | Pincushion |
| 67 | `func_ov024_021e13e0` | Choir of Angels |
| 68 | `func_ov024_021e1580` | 0 Zone |
| 69 | `func_ov024_021e16a4` | Itemised Kill |
| 70 | `func_ov024_021e1824` | Rough 'n' Tumble |
| 71 | `func_ov024_021e191c` | Tension Boost |
| 72 | `func_ov024_021e1cbc` | Voice of Experience |
| 73 | `func_ov024_021e1de8` | Knight Watch |
| 74 | `func_ov024_021e1ed4` | Brownie Boost |
| 78 | `func_ov024_021e268c` | Focus Pocus |

## 2. The handlers read

### Kinds 3, 4 and 5 — attack, defence, agility (`021db5ec`, `021db7c0`, `021db994`)

One shape, three stats. The levels are the record's `+0x30`, signed, held to
±2 (`0x021db61c`–`0x021db634`). Landed: the rider (`func_ov024_021e4b14`,
called with "dealt" 1 — so a rider on a change always rolls), then the
stat's own test — `func_0208776c` attack, `02087860` defence, `02087954`
agility: nothing under bit 0 of status `+0x14`, and a raise only below 2, a
fall only above −2 — then the level moved (`func_020877c0`, `020878b4`,
`020879a8`: the sum held to ±2, a sum of 0 clearing the level) and the stat
worked out again (`UpdateCombatantAttack`, `…Defense`, `…Agility`).

The levels live in status `+0x58`: attack bits 0–2, defence 3–5, agility 6–8,
each signed. Setting one stores a count — **attack 5** (`+0x6e`), **defence
6** (`+0x6f`), **agility 6** (`+0x70`) — and a flag in `+0x14` (`0x400`,
`0x800`, `0x1000`). How the counts run down is not read here.

**Attack's multiplier is not defence's**: `CalculateAttackBuffMultiplier` is
`1 + 0.25 × level` (decompiled, `src/Combat/Main/BasicAttackCalculation.cpp`),
and `UpdateCombatantAttack` truncates the product to a whole number, at most
999 for one of the party.

**The line** (`func_ov024_021e94c4`): by the level it comes to — raised to 2
"increases a lot" (attack `0x47`), to 0 "returns to normal" (`0x4b`),
otherwise "increases a little" (`0x49`); lowered to −2 "decreases a lot"
(`0x48`), to 0 normal, otherwise a little (`0x4a`). Defence's are
`0x3a`–`0x3e` and agility's `0x4c`–`0x50` in the same order. Not moved: the
record's own fail line, `+0x24` bits 10–19 (at one of the party) or 20–29 (at
a monster) — `func_ov024_021da644`, which picks the first for a target 0 to 3.

### Kind 7 — Squelch (`021dbc64`)

Landed on one poisoned (`func_020885b4`) or envenomed (`func_02088514`):
both cleared (`func_02088644`) and "is no longer poisoned" (`0x54`).
Otherwise the record's fail line.

### Kind 8 — sleep (`021dbd84`)

Landed on one who can sleep (`func_0208830c`): asleep (`func_02088338`, which
takes tension away), the line from `func_ov024_021e929c`. Already modelled.

### Kind 9 — waking (`021dbf18`)

Landed: the rider; then a sleeper (`func_020882f8`) wakes (`func_02088390`),
"wakes up" (`0x40`), and status `+0x3b` bit 0 is set. A rider that came to
something without the target waking says `0x173`, "pulls himself together"
(Sobering Slap's rider 19). Otherwise the fail line.

### Kind 17 — Whack, Thwack, Kathwack (`021dd028`)

Landed, and not (a target at the maximum of tension under an action whose
`+0x1c` bits 19–23 are 7): unless `func_ov024_021ea78c` keeps them alive —
a status `func_ov024_021e47dc` tests, for the actions listed at
`0x021fe6e0`, "heavenly protection keeps the reaper at bay" (`0xc8`), left on
1 HP — **all their HP is taken** (`func_ov000_0215a004` with `0xffff`) and the
record's kill line is said, `+0x28` bits 0–9 at one of the party ("dies!",
8) or 10–19 at a monster ("is killed", `0x45`). Not landed: the fail line —
621 at one of the party, 27 at a monster.

### Kind 18 — Zing, Kazing, the Zing stick (`021dd278`)

Landed on one fallen (`func_02010088`): back to life with a share of their
most HP (`func_0208902c`), `+0x3b` bit 0 set and, for one of the party,
`+0x3a` — the revival flag the coup's draw reads. The share, by the action:

- **Zing (38) and the Zing stick (84)**: cast by one of the party, by their
  magical mending against the record's `lo` and `hi` (`+0x04` bits 12–21 and
  22–31): a quarter at or under `lo`, a half at or over `hi`, and between,
  `(int)((25 / (hi − lo)) × (mending − lo))`, plus 25, over 100 — all in
  floats; cast by a monster, a half;
- **Kazing (39)**: a half (`0x021dd31c`);
- anything else that reaches it: whole.

The HP is `(int)(share × most HP)`. Its line is the record's own — `+0x20`
bits 20–29 at one of the party, `+0x24` bits 0–9 at a monster: "returns to
life!" (32). Not landed on the fallen: "remains lifeless" (`0x21`); on the
standing, the fail line.

## 3. What rides on a blow — the rider table (`data_ov024_021ff450`)

22 slots by `+0x18` bits 0–4, dispatched by `func_ov024_021e4b14`. Read here:

- **2, attack down** (`021e2ebc`) and **8, defence down** (`021e3594`): with
  something dealt, a draw below 100 **first**; the levels from `+0x32`, held
  to ±2. A fall lands when the draw is under the target's byte — `+0x4f`
  attack, `+0x50` defence — or at once on a critical; **the action's chance
  is not read**. A byte of 0 refuses it. Double Up (`0xad`) on defence skips
  the test. A raise always lands.
- **4, poison** (`021e303c`): with something dealt and the target's byte
  `+0x4d` not 0, and one who can take it (`func_020885e0`, or
  `func_02088540` for the stronger kind when `+0x32` is above 0): a draw below
  100, as a float, under the action's chance — one of the party's `+0x14`
  bits 7–13, a monster's bits 0–6 — times the byte over 100, or a hundred on
  a critical.
- **7, sleep** (`021e33a4`): the same, byte `+0x47`, one who can sleep
  (`func_0208830c`).
- **20, death** (`021e4604`): not on a metal body (`func_ov000_02156068`);
  the same, byte `+0x48`; then the protection of kind 17, and all HP taken.

Nobody's bytes are modelled — every one is a hundred, as `docs/conformance.md`
says of resistances — so a fall of attack or defence lands every time and its
draw is spent.

## 4. The record's lines

Three words of an action's record hold its lines, ten bits each:

| word | bits 0–9 | 10–19 | 20–29 |
|---|---|---|---|
| `+0x20` | opening (one of the party acts) | opening (a monster acts) | done, at one of the party |
| `+0x24` | done, at a monster | failed, at one of the party | failed, at a monster |
| `+0x28` | killed, at one of the party | killed, at a monster | its critical |

Read from the handlers that pick them (`func_ov024_021da644`), and borne out
by the cartridge: the Attack's are 1, 1, 2 / 5, 4, 7 / 8, 9, 140; Whack's
fail 621 and 27 and kill 8 and 69; Zing's done 32.

**So `Action.effect`, the byte at `+0x24` read as INFERRED "what it does",
is the low byte of the done line at a monster** — 5 "does damage to" on the
Attack and the attack spells, 22 "wounds are healed" on the heals. The code
still tells heals from harms by it, which holds for the actions it is used on;
the name is left as it is.

## 5. Envenomation, and what a battle tolls — a correction

Status `+0x14` bit 1 is poisoned, and `+0x22`'s low two bits say which:
**1 poison** (`func_02088624` sets it, `020885b4` tests it), **2
envenomation** (`func_02088560`, `02088514`). A poison rider (4) or kind 6
gives envenomation where the record's `+0x32`/`+0x30` is above 0
(`0x021e309c`, `0x021dbb20`): Toxic Dagger, Venom Mist, Venomissile and the
poison attack 275. Who may take it: nobody at the maximum of tension, and
plain poison not on the envenomated (`func_020885e0`, `func_02088540`) — the
poisoned are poisoned again, "even more powerfully" (`0x53`). Squelch, the
cure-all and the maximum of tension clear both.

**Only envenomation is tolled in a battle** — the round's end,
`func_ov000_0215a23c` `0x0215a5c8`–`0x0215a5f4`: a sixteenth of the most HP,
at most 999 and at least 1. Nothing in the ARM9 or any overlay tests plain
poison in a battle but to cure it, Victimiser's blow (`func_ov024_021d8d38`)
and the AI. The reference's "poison takes a sixteenth" is 275's, which is
envenomation; the simulation had it on plain poison.

## 6. Also read and built

- **Choir of Angels** (kind 67, `021e13e0`): every one of the party,
  `RoundUp(0.4 × most HP)`, at least 75 (`0x021e1418`–`0x021e1440`), healed
  with no test of its landing; then the cure-all (`func_ov024_021eae14`:
  sleep, the poisons, a level below 0 and many statuses the battle does not
  keep). Lines `0x1ba`, `0x16`, `0x1bb`, or `0x1f` for neither.
- **Tension Boost** (kind 71, `021e191c`): "a huge boost all of a sudden"
  (`0x1bc`), then each level to 4 told, no coin; nothing at the maximum.
- **Egg On** is kind 15, Psyche Up's own handler, on an ally.
- **Meditation** is kind 2, a heal, on its user.
- **A metal body's zeroing** (`func_ov024_021e6a90` `0x021e77c4`): a
  non-critical blow aimed at the monsters with `+0x10` bit 24 comes to
  nothing, bar `0x205` and Needle Shot (`0x82`); the coin follows.

Measured after: **55 struck as the Attack, where 76 were**; 19 played as
changes of state, 39 spells, 5 slot-0 blows now carrying their rider.
`apps/game/test/handlers.test.ts` holds the count.

## 7. What is left — by name, and the address that would answer it

**Still struck as the Attack** (55), by the kind whose handler is unread:

| kind | handler | actions |
|---|---|---|
| 0 | `func_ov024_021da670` | Counter Wait, Defending Champion, Back Atcha, Whipping Boy, Selflessness, Forbearance |
| 10 | `func_ov024_021dc0b8` | Trip of a Deathtime, War Cry, Pratfall |
| 13 | `func_ov024_021dc540` | M-Pathy |
| 14 | `func_ov024_021dc700` | H-Pathy |
| 16 | `func_ov024_021dced0` | Antimagic |
| 19 | `func_ov024_021dd534` | Flower Power, Scandal Eyes |
| 20 | `func_ov024_021dd6f0` | Tingle |
| 21 | `func_ov024_021dd828` | Fuddle |
| 22 | `func_ov024_021dd968` | Wizard Ward, Spooky Aura |
| 23 | `func_ov024_021ddaa0` | Mind Over Matter, Insulate, Insulatle |
| 25 | `func_ov024_021dde08` | Tap Dance |
| 31 | `func_ov024_021de678` | Magic Mirror, Bounce |
| 32 | `func_ov024_021de770` | Reverse Cycle |
| 36 | `func_ov024_021dec50` | Schizofanic |
| 37 | `func_ov024_021ded48` | Immense Defence |
| 38 | `func_ov024_021dee84` | Care Prayer |
| 39 | `func_ov024_021deff8` | Alma Mater |
| 40 | `func_ov024_021df0f0` | Rotstopper |
| 41 | `func_ov024_021df1e8` | Wave of Relief |
| 42 | `func_ov024_021df284` | Channel Anger, Caster Sugar |
| 43 | `func_ov024_021df454` | Mens Sana |
| 44 | `func_ov024_021df924` | Half-Inch |
| 45 | `func_ov024_021dfe9c` | Eye for Trouble |
| 46 | `func_ov024_021dff3c` | Fire Fource, Frost Fource, Gale Fource, Funereal Fource, Life Fource |
| 47 | `func_ov024_021e00c0` | Feel the Burn |
| 48 | `func_ov024_021e01b8` | Right as Rain |
| 49 | `func_ov024_021e02b0` | Disruptive Wave |
| 50 | `func_ov024_021e0380` | Extreme Makeover |
| 51 | `func_ov024_021e04e0` | Eyes on Me |
| 52 | `func_ov024_021e05fc` | Mercy |
| 53 | `func_ov024_021e07b0` | Soothe Sayer |
| 54 | `func_ov024_021e093c` | Vanish |
| 55 | `func_ov024_021e0a50` | Mist Me |
| 56 | `func_ov024_021e0b48` | Whistle |
| 63 | `func_ov024_021e1028` | Twocus Pocus |
| 64 | `func_ov024_021e1120` | Holy Impregnable |
| 66 | `func_ov024_021e1328` | Pincushion |
| 78 | `func_ov024_021e268c` | Focus Pocus |

Most need a status the battle does not keep — a counter, a barrier, Bounce's
mirror, dazzle, confusion, a stance (kind 0 is the six stances: Counter
Wait, Defending Champion …).

**Played as a plain blow, their own code unread:** Propeller Blade,
Crosscutter Throw, Gold Rush (its post-step 6, gold spent,
`data_ov024_021ff3f8`), and the six that scale by the user's number and what
they hold — Gigaslash, Gigagash, Lightning Storm, Hand of God, Whopper Chop,
Boulder Toss — by the table at `0x021fe8b6` (`docs/conformance.md`).

**Riders not played** (`data_ov024_021ff450`): 1 `021e2bd0` (the dances' and
War Cry's — a turn lost, INFERRED), 5 and 6 (the antidotes') `021e324c`,
`021e32f4`, 9 `021e373c` (Soothe Sayer), 10 `021e386c` (confusion,
INFERRED), 11 `021e3a34` (paralysis, INFERRED), 12 `021e3cec` (Rake 'n'
Break), 13 `021e3d88` (Conjury Conductor), 14 `021e3f14` (Morale Masher),
19 `021e4588` (Sobering Slap), 21 `021e47f4` (Caster Sugar). Their blows
land and deal; the rider is dropped.

**Coups not built** — each says its opening and does nothing: Roaring
Tirade and Disco Tech (kind 10, `021dc0b8`), Spelly Breath (kind 26,
`021ddf5c`, damage handler 48), 0 Zone (68, `021e1580`), Itemised Kill (69,
`021e16a4`), Rough 'n' Tumble (70, `021e1824`), Voice of Experience (72,
`021e1cbc`), Knight Watch (73, `021e1de8`), Brownie Boost (74, `021e1ed4`).

**Ours in what was built**: nobody's susceptibility bytes (`+0x46`–`+0x52`),
so a level rider's fall always lands; attack's turns run down as defence's
(its count, 5 at `+0x6e`, is not read in use) and wear off first at the
round's end; a raised one comes back with at least 1 HP; the flags a
raising and a waking set (`+0x3a`, `+0x3b` bit 0) are not kept; Whack's
heavenly protection (`func_ov024_021ea78c`) is a status not kept, so it never
spares; the cure-all clears only what the battle keeps.
