import { displayTitle, sequenceIndex } from './loadWorkouts.ts'
import { mondayKey } from './persist.ts'
import type { Program, ProgramProgress } from './types.ts'

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

/** 1-based week of the whole program, from the Monday of the week you started. */
export function calendarProgramWeek(startedAt: string, now = new Date()): number {
  const start = mondayDate(new Date(startedAt))
  const current = mondayDate(now)
  const days = Math.round((current.getTime() - start.getTime()) / 86_400_000)
  return Math.max(1, Math.floor(days / 7) + 1)
}

function weekInMonth(progress: ProgramProgress, now = new Date()): number {
  if (!progress.startedAt) return 1
  return calendarProgramWeek(progress.startedAt, now) - (progress.currentMonth - 1) * MONTH_WEEKS
}

export function currentWeek(progress: ProgramProgress, now = new Date()): number {
  return Math.min(MONTH_WEEKS, Math.max(1, weekInMonth(progress, now)))
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
