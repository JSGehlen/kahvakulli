import { displayTitle, sequenceIndex } from './loadWorkouts.ts'
import type { Program, ProgramPhase, ProgramProgress } from './types.ts'

export { displayTitle, sequenceIndex, levelLabel } from './loadWorkouts.ts'

export const MONTH_WEEKS = 4

/** After this many days without a session, ask where to pick up. */
export const BREAK_DAYS = 10

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export function emptyProgramProgress(): ProgramProgress {
  return { currentMonth: 1, completions: {}, trainingWeek: 1, weekDoneIds: [] }
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

export function isMultiMonth(program: Program): boolean {
  return program.phases.length > 1
}

/** The phase you're in, or the first one. */
export function currentPhase(program: Program, progress: ProgramProgress): ProgramPhase | undefined {
  return (
    program.phases.find((phase) => phase.month === progress.currentMonth) ?? program.phases[0]
  )
}

/** Week to show. Multi-month programs stop at week 4 until you proceed. */
export function currentWeek(program: Program, progress: ProgramProgress): number {
  const week = Math.max(1, progress.trainingWeek)
  return isMultiMonth(program) ? Math.min(MONTH_WEEKS, week) : week
}

/** Schedule rows in Monday → Sunday order: the order you work through a week. */
export function orderedSchedule<T extends { day: string }>(schedule: T[]): T[] {
  const order = (day: string) => {
    const index = WEEKDAYS.indexOf(day.toLowerCase())
    return index < 0 ? 99 : index
  }
  return [...schedule].sort((a, b) => order(a.day) - order(b.day))
}

export function sessionsPerWeek(program: Program, progress: ProgramProgress): number {
  const phase = currentPhase(program, progress)
  const schedule = phase?.schedule ?? program.schedule
  const sessions = phase?.sessions ?? program.sessions
  return Math.max(1, schedule.length || sessions.length)
}

export function usesAbAlternation(schedule: { workout?: string }[]): boolean {
  const names = new Set<string>()
  for (const row of schedule) {
    if (row.workout) names.add(row.workout)
  }
  return names.size === 2 && names.has('Workout A') && names.has('Workout B')
}

/** Odd training weeks = A/B/A, even = B/A/B. */
export function abCycleWeek(progress: ProgramProgress): number {
  return ((Math.max(1, progress.trainingWeek) - 1) % 2) + 1
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

/** Whole days since your last session, or undefined if there's nothing to compare. */
export function daysSinceActive(progress: ProgramProgress, now = new Date()): number | undefined {
  const stamp = progress.lastActiveAt ?? progress.startedAt
  if (!stamp) return undefined
  return Math.floor((now.getTime() - new Date(stamp).getTime()) / 86_400_000)
}

export function needsResumeChoice(progress: ProgramProgress, now = new Date()): boolean {
  if (!isStarted(progress)) return false
  const days = daysSinceActive(progress, now)
  if (days === undefined || days < BREAK_DAYS) return false
  return progress.trainingWeek > 1 || progress.weekDoneIds.length > 0
}

export function leftoverLine(program: Program, progress: ProgramProgress): string {
  if (!isMultiMonth(program)) {
    return 'Are you sure you want to end early? Your progress in this program will be cleared.'
  }
  const week = currentWeek(program, progress)
  const monthsLeft = Math.max(0, program.phases.length - progress.currentMonth)
  const weeksLeft = MONTH_WEEKS - week + 1 + monthsLeft * MONTH_WEEKS
  const amount = `${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'}`
  return `Are you sure you want to end early? You have ${amount} left of this program.`
}

export function canAdvanceMonth(program: Program, progress: ProgramProgress): boolean {
  if (!isMultiMonth(program)) return false
  const next = program.phases.find((phase) => phase.month === progress.currentMonth + 1)
  if (!next) return false
  return progress.trainingWeek > MONTH_WEEKS
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
