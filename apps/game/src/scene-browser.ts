import {
  conditionsFor,
  firstWay,
  type SceneConditions,
  type SceneEntry,
  type SceneWay,
  stageText,
} from './scenes.ts'

/**
 * The scene browser: every scene on the cartridge, found by number, area or a
 * line it speaks, and played as the game would start it — without playing the
 * game up to it. `?scenes=1` opens it. **Ours**, a development tool; see
 * `scenes.ts` for what it reads and what it does not.
 *
 * It knows the game only through {@link SceneHost}, so what it lists and what
 * plays a scene can be widened — a scene made rather than read — without
 * touching the panel.
 */
export interface SceneHost {
  /** Every scene, indexed once. */
  readonly scenes: readonly SceneEntry[]
  /** A map's code by its id, `M01M05`. */
  mapCodeOf(map: number): string | undefined
  /** The lines a scene speaks, for searching by what is said. */
  linesOf(event: number): readonly string[]
  /** Set the conditions and play the scene. */
  play(conditions: SceneConditions): void
  /** What is playing now, for the counter. */
  now(): { event: number; frame: number; message: number | undefined } | undefined
  paused: boolean
  speed: number
  /** Run the paused scene on by one of its frames. */
  step(): void
}

const WAY_WORDS: Record<SceneWay['kind'], string> = {
  talk: 'talking to',
  area: 'walking into an area',
  entry: 'entering the map',
  won: 'winning a set battle',
  lost: 'losing a set battle',
  handed: 'handed on from',
  other: 'a record of another kind',
}

/** How one way reads in the list: `D01M05 · 2.4 · talking to 203 · step 4 · flags 3 · not 5`. */
function describeWay(way: SceneWay, mapCodeOf: (map: number) => string | undefined): string {
  const who = way.who === undefined ? '' : way.kind === 'handed' ? ` ev${way.who}` : ` ${way.who}`
  const span =
    way.from.major === way.to.major && way.from.minor === way.to.minor
      ? stageText(way.from)
      : `${stageText(way.from)}–${stageText(way.to)}`
  return [
    mapCodeOf(way.map) ?? `map ${way.map}`,
    span,
    WAY_WORDS[way.kind] + who,
    way.step === undefined ? '' : `step ${way.step}`,
    way.flags.length ? `flags ${way.flags.join(',')}` : '',
    way.unless.length ? `not ${way.unless.join(',')}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

const SPEEDS = [0.25, 0.5, 1, 2, 4]

export class SceneBrowser {
  private readonly root: HTMLDivElement
  private readonly list: HTMLDivElement
  private readonly detail: HTMLDivElement
  private readonly counter: HTMLSpanElement
  private readonly search: HTMLInputElement
  private chosen: { entry: SceneEntry; way: SceneWay } | undefined
  private last: SceneConditions | undefined
  /** What each scene says, read the first time a search asks — see {@link SceneHost.linesOf}. */
  private readonly spoken = new Map<number, string>()

  constructor(private readonly host: SceneHost) {
    this.root = document.createElement('div')
    this.root.id = 'scenes'
    this.root.innerHTML = `
      <div class="head">
        <input type="search" placeholder="scene number, area, or a line" spellcheck="false">
        <button class="hide" title="Hide the browser">×</button>
      </div>
      <div class="list"></div>
      <div class="detail"></div>
      <div class="controls">
        <button class="pause" title="Pause or play the scene">❚❚</button>
        <button class="step" title="One frame on">+1</button>
        <button class="restart" title="Play it again from the start">↺</button>
        <select class="speed" title="How fast it plays"></select>
        <span class="counter"></span>
      </div>`
    this.list = this.root.querySelector('.list') as HTMLDivElement
    this.detail = this.root.querySelector('.detail') as HTMLDivElement
    this.counter = this.root.querySelector('.counter') as HTMLSpanElement
    this.search = this.root.querySelector('input') as HTMLInputElement
    const speed = this.root.querySelector('.speed') as HTMLSelectElement
    for (const value of SPEEDS) {
      const option = document.createElement('option')
      option.value = String(value)
      option.textContent = `${value}×`
      option.selected = value === 1
      speed.append(option)
    }
    // The game reads keys from the window; typing a search is not walking.
    this.root.addEventListener('keydown', (event) => event.stopPropagation())
    this.root.addEventListener('keyup', (event) => event.stopPropagation())
    this.search.addEventListener('input', () => this.showList())
    speed.addEventListener('change', () => {
      host.speed = Number(speed.value)
    })
    const pause = this.root.querySelector('.pause') as HTMLButtonElement
    pause.addEventListener('click', () => {
      host.paused = !host.paused
      pause.textContent = host.paused ? '▶' : '❚❚'
    })
    this.root.querySelector('.step')?.addEventListener('click', () => {
      host.paused = true
      pause.textContent = '▶'
      host.step()
    })
    this.root.querySelector('.restart')?.addEventListener('click', () => {
      if (this.last) host.play(this.last)
    })
    this.root.querySelector('.hide')?.addEventListener('click', () => {
      this.root.hidden = true
      document.body.classList.remove('scenes-open')
    })
    document.body.append(this.root)
    document.body.classList.add('scenes-open')
    this.showList()
  }

  get open(): boolean {
    return !this.root.hidden
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden
    document.body.classList.toggle('scenes-open', !this.root.hidden)
  }

  /** Keep the counter current: the scene, its frame, and the message up. */
  tick(): void {
    if (this.root.hidden) return
    const now = this.host.now()
    this.counter.textContent = now
      ? `ev${now.event} · frame ${now.frame}${now.message === undefined ? '' : ` · message ${now.message}`}`
      : 'no scene playing'
  }

  /** Play the chosen scene, a way given or its first, as the game would start it. */
  play(entry: SceneEntry, way: SceneWay | undefined = firstWay(entry)): void {
    const conditions = way ? conditionsFor(entry.event, way) : undefined
    if (!conditions) return
    this.last = conditions
    this.host.play(conditions)
  }

  private matches(entry: SceneEntry, words: string): boolean {
    if (words === '') return true
    const number = words.replace(/^ev/i, '')
    if (/^\d+$/.test(number)) return String(entry.event).includes(String(Number(number)))
    const upper = words.toUpperCase()
    if (entry.ways.some((way) => way.area === upper || this.host.mapCodeOf(way.map) === upper)) {
      return true
    }
    // A line it says: read once, the first time a search needs it.
    let said = this.spoken.get(entry.event)
    if (said === undefined) {
      said = this.host.linesOf(entry.event).join('\n').toLowerCase()
      this.spoken.set(entry.event, said)
    }
    return said.includes(words.toLowerCase())
  }

  private showList(): void {
    const words = this.search.value.trim()
    const byArea = new Map<string, SceneEntry[]>()
    for (const entry of this.host.scenes) {
      if (!this.matches(entry, words)) continue
      const area = firstWay(entry)?.area ?? '—'
      byArea.set(area, [...(byArea.get(area) ?? []), entry])
    }
    this.list.replaceChildren()
    for (const [area, entries] of [...byArea].sort(([a], [b]) => a.localeCompare(b))) {
      const heading = document.createElement('div')
      heading.className = 'area'
      heading.textContent = `${area} · ${entries.length}`
      this.list.append(heading)
      // In story order within the area, as they come.
      const ordered = [...entries].sort((a, b) => {
        const x = firstWay(a)?.from
        const y = firstWay(b)?.from
        return (
          (x ? x.major * 100 + x.minor : 0) - (y ? y.major * 100 + y.minor : 0) || a.event - b.event
        )
      })
      for (const entry of ordered) {
        const row = document.createElement('button')
        row.className = 'scene'
        const way = firstWay(entry)
        row.textContent = `ev${String(entry.event).padStart(5, '0')}  ${way ? stageText(way.from) : ''}`
        if (this.chosen?.entry === entry) row.classList.add('chosen')
        row.addEventListener('click', () => this.choose(entry, firstWay(entry)))
        row.addEventListener('dblclick', () => this.play(entry))
        this.list.append(row)
      }
    }
  }

  private choose(entry: SceneEntry, way: SceneWay | undefined): void {
    if (!way) return
    this.chosen = { entry, way }
    this.showList()
    const wanted = conditionsFor(entry.event, way)
    this.detail.replaceChildren()
    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = `ev${String(entry.event).padStart(5, '0')}`
    this.detail.append(title)
    for (const other of entry.ways) {
      const line = document.createElement('label')
      line.className = 'way'
      const pick = document.createElement('input')
      pick.type = 'radio'
      pick.name = 'way'
      pick.checked = other === way
      pick.addEventListener('change', () => this.choose(entry, other))
      line.append(pick, ` ${describeWay(other, (m) => this.host.mapCodeOf(m))}`)
      this.detail.append(line)
    }
    // What will be set: from the record, and changeable before playing.
    const form = document.createElement('div')
    form.className = 'set'
    const field = (label: string, value: string) => {
      const input = document.createElement('input')
      input.value = value
      input.spellcheck = false
      const holder = document.createElement('label')
      holder.append(`${label} `, input)
      form.append(holder)
      return input
    }
    const stage = field('stage', stageText(wanted.stage))
    const step = field('step', wanted.step === undefined ? '' : String(wanted.step))
    const flags = field('flags', wanted.flags.join(','))
    const play = document.createElement('button')
    play.className = 'play'
    play.textContent = 'Play'
    play.addEventListener('click', () => {
      const [major, minor] = stage.value.split('.').map(Number)
      const conditions: SceneConditions = {
        ...wanted,
        stage: { major: major ?? wanted.stage.major, minor: minor ?? wanted.stage.minor },
        step: step.value.trim() === '' ? undefined : Number(step.value),
        flags: flags.value
          .split(',')
          .map((f) => f.trim())
          .filter((f) => /^\d+$/.test(f))
          .map(Number),
      }
      this.last = conditions
      this.host.play(conditions)
    })
    form.append(play)
    this.detail.append(form)
    const note = document.createElement('div')
    note.className = 'note'
    note.textContent =
      'Set from the record that plays it. Who is in the party, and anything past the flags and the step, is not in the record.'
    this.detail.append(note)
  }
}
