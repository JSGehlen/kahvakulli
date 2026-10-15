import { displayTitle, sequenceIndex } from './loadWorkouts.ts'
import { mondayKey } from './persist.ts'
import type { Exercise, Program, ProgramProgress, ScheduleRow, Session } from './types.ts'

export { displayTitle, sequenceIndex, levelLabel } from './loadWorkouts.ts'

export const MONTH_WEEKS = 4

export function emptyProgramProgress(): ProgramProgress {
  return { currentMonth: 1, completions: {} }
}

export function programEyebrow(program: Program): string {
  if (program.isBuiltin) return ''
  return (
    [program.duration, program.difficulty].filter(Boolean).join(' · ') ||
    (program.isPublic ? 'Shared' : 'Program')
  )
}

export function monthLabel(program: Program, month: number): string | undefined {
  if (program.phases.length < 2) return undefined
  return `Month ${month}`
}

export function isStarted(progress: ProgramProgress): boolean {
  return Boolean(progress.startedAt)
}

function mondayDate(date: Date): Date {
  const key = mondayKey(date)
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
}

const DOSE_RANGE =
  /^(\d+)\s*[–—-]\s*(\d+)\s*(seconds?|secs?|s)?\b\s*(.*)$/i

/** Programs that step through a rep range across the whole block, such as Muscle. */
export function progressionWeeks(program: Program): number | undefined {
  const match = program.duration?.match(/(\d+)\s*weeks\b/i)
  if (match) return Number(match[1])
  if (/^muscle$/i.test(program.stage ?? '') || /muscle-focused/i.test(program.title)) return 12
  return undefined
}

/** 1-based week used to pick a single rep count. Week 1 before the program starts. */
export function prescriptionWeek(
  program: Program,
  progress: ProgramProgress,
  now = new Date(),
): number {
  const total = progressionWeeks(program)
  if (!total) return 0
  if (!progress.startedAt) return 1
  return calendarProgramWeek(progress.startedAt, now)
}

export function progressionWeekLabel(week: number, totalWeeks: number): string {
  if (week <= totalWeeks) return `Week ${week} of ${totalWeeks}`
  return `Week ${week}`
}

function doseForWeek(low: number, high: number, week: number, totalWeeks: number, timed: boolean): number {
  const block = Math.max(1, Math.round(totalWeeks / 3))
  if (week <= block) return low
  if (week <= block * 2) {
    const mid = (low + high) / 2
    return timed ? Math.round(mid / 5) * 5 : Math.round(mid)
  }
  return high
}

/** Turn "8–15 per side" into the count for this week. Fixed doses stay as written. */
export function prescribeExercise(exercise: Exercise, week: number, totalWeeks: number): Exercise {
  if (week < 1 || totalWeeks < 1 || !exercise.target) return exercise
  const match = exercise.target.match(DOSE_RANGE)
  if (!match) return exercise
  const low = Number(match[1])
  const high = Number(match[2])
  const timed = Boolean(match[3])
  const suffix = (match[4] ?? '').trim()
  const value = doseForWeek(low, high, week, totalWeeks, timed)
  const target = `${value}${timed ? 's' : ''}${suffix ? ` ${suffix}` : ''}`
  return {
    ...exercise,
    target,
    reps: !timed && exercise.reps != null ? value : exercise.reps,
  }
}

function isCoreAbsSession(session: Session): boolean {
  return /core\s*&\s*abs/i.test(session.name)
}

/** Workout C starts with 2 sets, then uses the counts written on each lift. */
export function prescribeSession(session: Session, week: number, totalWeeks: number): Session {
  if (week < 1 || totalWeeks < 1) return session
  const introSets = isCoreAbsSession(session) && week <= 2
  return {
    ...session,
    exercises: session.exercises.map((exercise) => {
      const prescribed = prescribeExercise(exercise, week, totalWeeks)
      if (!introSets || prescribed.sets == null || prescribed.sets <= 2) return prescribed
      return { ...prescribed, sets: 2 }
    }),
  }
}

export function coreSetProgressionNote(program: Program): string | undefined {
  const sessions = [
    ...program.sessions,
    ...program.phases.flatMap((phase) => phase.sessions),
  ]
  if (!sessions.some(isCoreAbsSession)) return undefined
  return 'Workout C uses 2 sets of each move in weeks 1–2, then the full set counts from week 3.'
}

/** Drop a dose that only repeats the big rep count, keeping "per side" and similar. */
export function prescriptionDetail(target: string | undefined, reps: number | undefined): string | undefined {
  if (!target) return undefined
  if (reps == null) return target
  if (target === String(reps) || target === `${reps} reps`) return undefined
  if (target.startsWith(String(reps))) {
    const rest = target.slice(String(reps).length).replace(/^s?\s*/, '').trim()
    return rest || undefined
  }
  return target
}

export function progressionNote(totalWeeks: number): string {
  const block = Math.max(1, Math.round(totalWeeks / 3))
  const midEnd = block * 2
  return `Weeks 1–${block} use the lower end of each range, ${block + 1}–${midEnd} the middle, and ${midEnd + 1}–${totalWeeks} the upper end. Add weight when every set reaches the top comfortably.`
}

/**
 * Muscle trains A / B / C on Monday, Wednesday, and Friday.
 * Older seeds listed Friday as Workout A; use C when that session exists.
 */
export function alignMuscleSchedule(program: Program, schedule: ScheduleRow[]): ScheduleRow[] {
  if (!progressionWeeks(program)) return schedule
  if (!/^muscle$/i.test(program.stage ?? '') && !/muscle-focused/i.test(program.title)) return schedule
  const names = new Set(program.sessions.map((session) => session.name))
  for (const phase of program.phases) {
    for (const session of phase.sessions) names.add(session.name)
  }
  const core = [...names].find((name) => /^workout\s+c\b/i.test(name))
  if (!core) return schedule
  return schedule.map((row) =>
    row.day.toLowerCase() === 'friday' && /^workout\s+a\b/i.test(row.workout)
      ? { ...row, workout: core }
      : row,
  )
}

/** 1-based week of the whole program, from the Monday of the week you started. */
export function calendarProgramWeek(startedAt: string, now = new Date()): number {
  const start = mondayDate(new Date(startedAt))
  const current = mondayDate(now)
  const days = Math.round((current.getTime() - start.getTime()) / 86_400_000)
  return Math.max(1, Math.floor(days / 7) + 1)
}

function weekInMonth(progress: ProgramProgress, now = new Date()): number {
  const origin = monthWeekOrigin(progress)
  if (!origin) return 1
  const current = mondayDate(now)
  if (current.getTime() < origin.getTime()) return 0
  const days = Math.round((current.getTime() - origin.getTime()) / 86_400_000)
  return Math.floor(days / 7) + 1
}

/** Monday Week 1 of the current month begins. Later months wait until the next Monday if you proceed mid-week. */
export function monthWeekOrigin(progress: ProgramProgress): Date | undefined {
  const stamp =
    progress.currentMonth > 1
      ? (progress.monthStartedAt ?? progress.startedAt)
      : progress.startedAt
  if (!stamp) return undefined
  const started = new Date(stamp)
  const monday = mondayDate(started)
  if (progress.currentMonth <= 1 || started.getDay() === 1) return monday
  const next = new Date(monday)
  next.setDate(next.getDate() + 7)
  return next
}

export function monthWeekHasStarted(progress: ProgramProgress, now = new Date()): boolean {
  return weekInMonth(progress, now) >= 1
}

export function currentWeek(progress: ProgramProgress, now = new Date()): number {
  const raw = weekInMonth(progress, now)
  if (raw < 1) return 0
  return Math.min(MONTH_WEEKS, raw)
}

export function usesAbAlternation(schedule: { workout?: string }[]): boolean {
  const names = new Set<string>()
  for (const row of schedule) {
    if (row.workout) names.add(row.workout)
  }
  return names.size === 2 && names.has('Workout A') && names.has('Workout B')
}

/** Week 1 = A/B/A, week 2 = B/A/B, then repeat from the Monday you started. */
export function abCycleWeek(progress: ProgramProgress, now = new Date()): number {
  if (!progress.startedAt) return 1
  return ((calendarProgramWeek(progress.startedAt, now) - 1) % 2) + 1
}

export function scheduleForAbCycle<T extends { workout: string }>(
  schedule: T[],
  cycleWeek: number,
): T[] {
  if (cycleWeek % 2 === 1 || !usesAbAlternation(schedule)) return schedule
  return schedule.map((row) => {
    if (row.workout === 'Workout A') return { ...row, workout: 'Workout B' }
    if (row.workout === 'Workout B') return { ...row, workout: 'Workout A' }
    return row
  })
}

export function leftoverLine(program: Program, progress: ProgramProgress): string {
  if (program.phases.length < 2) {
    return "Are you sure you want to end early? You have this week's sessions left of this program."
  }
  const month = progress.currentMonth
  const week = currentWeek(progress)
  const monthsLeft = Math.max(0, program.phases.length - month)
  const weeksLeft = MONTH_WEEKS - week + monthsLeft * MONTH_WEEKS
  const amount = `${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'}`
  return `Are you sure you want to end early? You have ${amount} left of this program.`
}

export function canAdvanceMonth(program: Program, progress: ProgramProgress): boolean {
  if (program.phases.length < 2) return false
  const current = program.phases.find((phase) => phase.month === progress.currentMonth)
  const next = program.phases.find((phase) => phase.month === progress.currentMonth + 1)
  if (!current || !next) return false
  return weekInMonth(progress) >= MONTH_WEEKS
}

export function splitProgramLists(programs: Program[], userId?: string) {
  const beginner = programs
    .filter((program) => program.isBuiltin)
    .sort((a, b) => sequenceIndex(a) - sequenceIndex(b))
  const mine = programs
    .filter((program) => program.userId === userId && !program.isBuiltin)
    .sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)))
  const others = programs
    .filter(
      (program) =>
        Boolean(program.isPublic) &&
        !program.isBuiltin &&
        program.userId !== userId,
    )
    .sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)))
  return { beginner, mine, others }
}
