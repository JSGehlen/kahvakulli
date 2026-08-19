import { displayTitle, sequenceIndex } from './loadWorkouts.ts'
import type { Program, ProgramPhase, ProgramProgress } from './types.ts'

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

export function weeksCompleted(phase: ProgramPhase, completions: Record<string, number>): number {
  if (phase.sessions.length === 0) return 0
  return Math.min(...phase.sessions.map((session) => completions[session.id] ?? 0))
}

export function canAdvanceMonth(program: Program, progress: ProgramProgress): boolean {
  if (program.phases.length < 2) return false
  const current = program.phases.find((phase) => phase.month === progress.currentMonth)
  const next = program.phases.find((phase) => phase.month === progress.currentMonth + 1)
  if (!current || !next) return false
  return weeksCompleted(current, progress.completions) >= MONTH_WEEKS
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
