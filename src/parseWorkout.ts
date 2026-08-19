import type {
  Exercise,
  GlossaryEntry,
  Program,
  ScheduleRow,
  Session,
  Warmup,
  WarmupStep,
  WeightRef,
} from './types.ts'

const HR = /^(?:[-–—*_]{3,}|⸻)\s*$/u

function unwrapInline(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1').trim()
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function titleFromFilename(sourceFile: string): string {
  return sourceFile
    .replace(/\.md$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function stripHeading(line: string): string {
  return unwrapInline(line.replace(/^#{1,6}\s+/, ''))
}

function isHr(line: string): boolean {
  return HR.test(line.trim())
}

function parseDurationToSeconds(raw: string): number | undefined {
  const range = raw.match(
    /(\d+)\s*(?:–|-|to)\s*(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m)\b/i,
  )
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    const unit = range[3].toLowerCase()
    const mid = (a + b) / 2
    return unit.startsWith('m') ? Math.round(mid * 60) : Math.round(mid)
  }

  const single = raw.match(
    /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)\b/i,
  )
  if (!single) return undefined
  const n = Number(single[1])
  const unit = single[2].toLowerCase()
  return unit.startsWith('m') ? Math.round(n * 60) : Math.round(n)
}

function sectionKey(line: string): string | undefined {
  const text = stripHeading(line)
  if (!text) return undefined
  if (/^equipment$/i.test(text)) return 'equipment'
  if (/^weekly\s+schedule$/i.test(text)) return 'schedule'
  if (/^warm[- ]?up$/i.test(text)) return 'warmup'
  if (/^(exercise\s+)?glossary$/i.test(text)) return 'glossary'
  if (/^(quick\s+)?weight\s+reference$/i.test(text)) return 'weights'
  if (/^workout\b/i.test(text) && text.length < 80) return `session:${text}`
  return undefined
}

function formatPhase(key: string, raw: string): string {
  const value = raw.trim()
  if (key.toLowerCase() === 'month') {
    const n = value.match(/^(\d+)/)
    return n ? `Month ${n[1]}` : value
  }
  const named = value.match(/^month\s+(\d+)/i)
  if (named) return `Month ${named[1]}`
  return value
}

function splitBlocks(md: string): {
  title: string
  duration?: string
  difficulty?: string
  focus?: string
  stage?: string
  sections: { key: string; body: string }[]
} {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  let title = ''
  let duration: string | undefined
  let difficulty: string | undefined
  let focus: string | undefined
  let stage: string | undefined
  const sections: { key: string; body: string }[] = []
  let current: { key: string; lines: string[] } | undefined

  const push = () => {
    if (!current) return
    sections.push({ key: current.key, body: current.lines.join('\n').trim() })
    current = undefined
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const trimmed = unwrapInline(line.trim())
    const meta = trimmed.match(/^(duration|month|phase|difficulty|focus|summary|name|stage):\s*(.+)$/i)
    if (meta) {
      const key = meta[1].toLowerCase()
      const value = meta[2].trim()
      if (key === 'difficulty') difficulty = value
      else if (key === 'focus' || key === 'summary') focus = value
      else if (key === 'name' || key === 'stage') stage = value
      else duration = formatPhase(key, value)
      continue
    }
    if (!trimmed || isHr(trimmed)) continue

    const key = sectionKey(trimmed)
    if (key) {
      push()
      current = { key, lines: [] }
      continue
    }

    if (!title && !current) {
      title = stripHeading(trimmed)
      continue
    }

    if (!current) {
      current = { key: 'intro', lines: [trimmed] }
      continue
    }
    current.lines.push(trimmed)
  }
  push()

  return { title, duration, difficulty, focus, stage, sections }
}

function parseListItems(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
    .map((line) => line.replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
}

function parseTwoColumnRows(body: string): string[][] {
  const rows: string[][] = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line || /^[-:| ]+$/.test(line)) continue
    if (line.includes('|')) {
      const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter(Boolean)
      if (cells.length >= 2) rows.push(cells)
      continue
    }
    const parts = line.split(/\t+|\s{2,}/).map((part) => part.trim()).filter(Boolean)
    if (parts.length >= 2) rows.push(parts)
  }
  return rows
}

function parseSchedule(body: string): ScheduleRow[] {
  const rows = parseTwoColumnRows(body)
  return rows
    .filter(([day, workout]) => day && workout && !/^day$/i.test(day))
    .map(([day, workout]) => ({ day, workout }))
}

function parseWeights(body: string): WeightRef[] {
  const rows = parseTwoColumnRows(body)
  return rows
    .filter(([exercise, bell]) => exercise && bell && !/^exercise$/i.test(exercise))
    .map(([exercise, bell]) => ({ exercise, bell }))
}

function parseWarmup(body: string): Warmup {
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean)
  let label = 'Warm-up'
  let totalSec = 240
  const steps: WarmupStep[] = []

  for (const line of lines) {
    if (/^repeat\b/i.test(line)) {
      label = line.replace(/:$/, '')
      const parsed = parseDurationToSeconds(line)
      if (parsed) totalSec = parsed
      continue
    }
    const item = line.replace(/^\d+[.)]\s+/, '').replace(/^[-*+]\s+/, '')
    const duration = parseDurationToSeconds(item) ?? 30
    const name = item.replace(/\s*[-–—]\s*\d+.*/u, '').trim() || item
    if (name) steps.push({ name, durationSec: duration })
  }

  if (steps.length === 0) {
    steps.push({ name: 'Easy movement', durationSec: 30 })
  }

  const circuit = steps.reduce((sum, step) => sum + step.durationSec, 0)
  if (!/repeat\b/i.test(label)) totalSec = circuit

  return { label, totalSec, steps }
}

function parseMetaValue(line: string): { key: string; value: string } | undefined {
  const match = line.match(
    /^(work|rest|suggested\s+bell|bell|notes?|reps?|target)\s*:\s*(.+)$/i,
  )
  if (!match) return undefined
  const key = match[1].toLowerCase().replace(/\s+/g, ' ')
  return { key, value: match[2].trim() }
}

function parseSession(name: string, body: string): Session {
  const lines = body.split('\n')
  let rounds = 1
  const exercises: Exercise[] = []
  let current: Exercise | undefined

  const push = () => {
    if (!current) return
    if (!current.workSec) current.workSec = 30
    if (current.restSec < 0) current.restSec = 30
    exercises.push(current)
    current = undefined
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const repeat = line.match(/repeat\s+(\d+)\s*[×x]|(\d+)\s*(?:rounds?|times?)/i)
    if (/^repeat\b/i.test(line) || (repeat && !current)) {
      const count = line.match(/(\d+)/)
      if (count) rounds = Number(count[1])
      continue
    }

    const numbered = line.match(/^\d+[.)]\s+(.+)$/)
    if (numbered) {
      push()
      current = {
        name: numbered[1].trim(),
        workSec: 0,
        restSec: -1,
        notes: [],
      }
      continue
    }

    if (!current) continue
    const bullet = line.replace(/^[-*+]\s+/, '')
    const meta = parseMetaValue(bullet)
    if (meta) {
      if (meta.key === 'work') current.workSec = parseDurationToSeconds(meta.value) ?? current.workSec
      else if (meta.key === 'rest') current.restSec = parseDurationToSeconds(meta.value) ?? 0
      else if (meta.key === 'bell' || meta.key === 'suggested bell') current.bell = meta.value
      else if (meta.key === 'rep' || meta.key === 'reps') {
        const count = Number(meta.value.match(/\d+/)?.[0])
        if (count) current.reps = count
        else current.target = meta.value
      } else if (meta.key === 'target') current.target = meta.value
      else current.notes.push(meta.value)
      continue
    }
    current.notes.push(bullet)
  }
  push()

  return {
    id: slugify(name),
    name,
    rounds,
    type: 'regular',
    exercises,
  }
}

function parseGlossaryEntry(chunk: string): GlossaryEntry | undefined {
  const lines = chunk
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return undefined
  const name = stripHeading(lines[0])
  const steps: string[] = []
  const notes: string[] = []
  for (const line of lines.slice(1)) {
    if (/^\d+[.)]\s+/.test(line)) steps.push(line.replace(/^\d+[.)]\s+/, ''))
    else if (/^[-*+]\s+/.test(line)) notes.push(line.replace(/^[-*+]\s+/, ''))
    else notes.push(line)
  }
  return { id: slugify(name), name, steps, notes }
}

function looksLikeExerciseName(heading: string): boolean {
  if (!heading || heading.includes(':')) return false
  if (heading.length > 70) return false
  if (heading.split(/\s+/).length > 8) return false
  if (/^(for|if|when|during|note|on|one|the)\b/i.test(heading)) return false
  return true
}

function parseGlossary(body: string): GlossaryEntry[] {
  const byHr = body
    .split(/\n(?:[-–—*_]{3,}|⸻)\s*\n/u)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map(parseGlossaryEntry)
    .filter((entry): entry is GlossaryEntry => Boolean(entry))

  if (byHr.length > 1) return byHr

  const entries: GlossaryEntry[] = []
  let name = ''
  let steps: string[] = []
  let notes: string[] = []

  const flush = () => {
    if (name) entries.push({ id: slugify(name), name, steps, notes })
    name = ''
    steps = []
    notes = []
  }

  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (/^\d+[.)]\s+/.test(line)) {
      steps.push(line.replace(/^\d+[.)]\s+/, ''))
      continue
    }
    if (/^[-*+]\s+/.test(line) && name) {
      notes.push(line.replace(/^[-*+]\s+/, ''))
      continue
    }
    const heading = stripHeading(line)
    if (name && (steps.length > 0 || notes.length > 0)) {
      if (looksLikeExerciseName(heading)) flush()
      else {
        notes.push(heading)
        continue
      }
    }
    if (name && !looksLikeExerciseName(heading)) {
      notes.push(heading)
      continue
    }
    name = heading
  }
  flush()
  return entries.length > 0 ? entries : byHr
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/\bkettlebell\b/g, '')
    .replace(/\b2\s*hands?\b/g, '')
    .replace(/\bkneeling\b/g, '')
    .replace(/\b(right|left|alternating)\b/g, '')
    .replace(/ies\b/g, 'y')
    .replace(/s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function matchGlossary(name: string, glossary: GlossaryEntry[]): GlossaryEntry | undefined {
  const needle = normalizeName(name)
  if (!needle) return undefined

  let best: { entry: GlossaryEntry; score: number } | undefined
  for (const entry of glossary) {
    const hay = normalizeName(entry.name)
    if (!hay) continue
    let score = 0
    if (hay === needle) score = 1000 + hay.length
    else if (needle.includes(hay) || hay.includes(needle)) score = hay.length
    if (score > 0 && (!best || score > best.score)) best = { entry, score }
  }
  return best?.entry
}

export function matchGlossaryEntries(name: string, glossary: GlossaryEntry[]): GlossaryEntry[] {
  const parts = name.split(/\s+or\s+/i).map((part) => part.trim()).filter(Boolean)
  const matches: GlossaryEntry[] = []
  for (const part of parts) {
    const match = matchGlossary(part, glossary)
    if (match && !matches.some((entry) => entry.name === match.name)) matches.push(match)
  }
  return matches
}

export function parseWorkoutMarkdown(markdown: string, sourceFile: string): Program {
  const { title, duration, difficulty, focus, stage, sections } = splitBlocks(markdown)
  const equipment: string[] = []
  const schedule: ScheduleRow[] = []
  const sessions: Session[] = []
  let warmup: Warmup | undefined
  let glossary: GlossaryEntry[] = []
  let weightReference: WeightRef[] = []

  for (const section of sections) {
    if (section.key === 'equipment') equipment.push(...parseListItems(section.body))
    else if (section.key === 'schedule') schedule.push(...parseSchedule(section.body))
    else if (section.key === 'warmup') warmup = parseWarmup(section.body)
    else if (section.key === 'glossary') glossary = parseGlossary(section.body)
    else if (section.key === 'weights') weightReference = parseWeights(section.body)
    else if (section.key.startsWith('session:')) {
      sessions.push(parseSession(section.key.slice('session:'.length), section.body))
    }
  }

  const programTitle = title || titleFromFilename(sourceFile)

  return {
    id: slugify(programTitle) || slugify(sourceFile),
    title: programTitle,
    equipment,
    duration,
    difficulty,
    focus,
    stage,
    schedule,
    warmup,
    sessions,
    phases: [],
    glossary,
    weightReference,
    sourceFile,
  }
}
