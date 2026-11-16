import type { Exercise, ExerciseLog, Program } from './types.ts'

/** Bells you own, in kg, from the program's equipment list ("1 × 16 kg kettlebell"). */
export function ownedBells(program: Program): number[] {
  const kgs = new Set<number>()
  for (const item of program.equipment) {
    const match = item.match(/(\d+(?:\.\d+)?)\s*kg/i)
    if (match) kgs.add(Number(match[1]))
  }
  return [...kgs].sort((a, b) => a - b)
}

export function bellLabel(kg: number): string {
  return `${kg} kg`
}

/** First kg number in a bell text: "12–16 kg" → 12, "BW / 12–16 kg" → 12. */
export function bellKg(text: string | undefined): number | undefined {
  if (!text) return undefined
  const match = text.match(/(\d+(?:\.\d+)?)/)
  return match ? Number(match[1]) : undefined
}

/** Rep range from a target like "8–15" or "8–15 per side". Falls back to the plain rep count. */
export function repRange(exercise: Exercise): { low: number; high: number } | undefined {
  const match = exercise.target?.match(/(\d+)\s*[–-]\s*(\d+)/)
  if (match && !/s\b|sec/i.test(exercise.target ?? '')) {
    return { low: Number(match[1]), high: Number(match[2]) }
  }
  if (exercise.reps) return { low: exercise.reps, high: exercise.reps }
  return undefined
}

export function isTimed(exercise: Exercise): boolean {
  return exercise.workSec > 0 && !exercise.reps
}

export function logKey(name: string): string {
  return name.trim().toLowerCase()
}

export function formatLog(log: ExerciseLog): string {
  return [log.bell, log.reps ? `${log.reps} reps` : undefined].filter(Boolean).join(' × ')
}

/**
 * Double progression: once you hit the top of the rep range, move up a bell
 * and work back up from the bottom of the range.
 */
export function progressionHint(
  exercise: Exercise,
  last: ExerciseLog | undefined,
  bells: number[],
): string | undefined {
  if (!last?.reps) return undefined
  const range = repRange(exercise)
  if (!range || range.low === range.high) return undefined
  if (last.reps < range.high) return undefined
  const current = bellKg(last.bell)
  const next = current === undefined ? undefined : bells.find((kg) => kg > current)
  if (next) return `Top of the range last time. Try ${bellLabel(next)} for ${range.low}+ reps.`
  return 'Top of the range last time. Slow the lowering or add a pause.'
}

/** Suggested starting bell: the hint's next bell, last time's bell, or the program's suggestion. */
export function defaultBell(
  exercise: Exercise,
  last: ExerciseLog | undefined,
  bells: number[],
): string | undefined {
  if (last?.bell) {
    const range = repRange(exercise)
    const current = bellKg(last.bell)
    if (range && last.reps && range.low !== range.high && last.reps >= range.high && current) {
      const next = bells.find((kg) => kg > current)
      if (next) return bellLabel(next)
    }
    return last.bell
  }
  const suggested = bellKg(exercise.bell)
  if (suggested !== undefined && bells.includes(suggested)) return bellLabel(suggested)
  return undefined
}
