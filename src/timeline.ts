import { matchGlossary } from './parseWorkout.ts'
import type { Program, Segment, Session } from './types.ts'

export function estimateSessionSeconds(
  session: Session,
  warmupSec = 0,
  includeWarmup = false,
): number {
  let total = includeWarmup ? warmupSec : 0
  total += 5
  for (let round = 1; round <= session.rounds; round += 1) {
    session.exercises.forEach((exercise, index) => {
      total += exercise.workSec
      const last =
        round === session.rounds && index === session.exercises.length - 1
      if (!last) total += Math.max(exercise.restSec, 0)
    })
  }
  return total
}

export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.ceil(totalSec))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatMinutes(totalSec: number): string {
  const minutes = Math.max(1, Math.round(totalSec / 60))
  return `~${minutes} min`
}

export function sessionMinutes(program: Program, session: Session, includeWarmup = true): number {
  return Math.max(
    1,
    Math.round(estimateSessionSeconds(session, program.warmup?.totalSec, includeWarmup) / 60),
  )
}

export function formatWarmupMeta(label: string): string {
  const match = label.match(/(\d+\s*[–-]\s*\d+)\s*min/i)
  if (match) return `Repeats for ${match[1].replace(/\s+/g, '')} min`
  return label
}

export function buildTimeline(
  program: Program,
  session: Session,
  includeWarmup: boolean,
): Segment[] {
  const segments: Segment[] = []

  const first = session.exercises[0]

  if (includeWarmup && program.warmup) {
    const { warmup } = program
    let elapsed = 0
    let guard = 0
    while (elapsed < warmup.totalSec && guard < 40) {
      for (const step of warmup.steps) {
        if (elapsed >= warmup.totalSec) break
        segments.push({
          kind: 'warmup',
          title: step.name,
          subtitle: formatWarmupMeta(warmup.label),
          durationSec: step.durationSec,
          nextTitle: first?.name,
        })
        elapsed += step.durationSec
      }
      guard += 1
    }
  }

  if (first) {
    segments.push({
      kind: 'prepare',
      title: first.name,
      subtitle: `Round 1/${session.rounds} · Move 1/${session.exercises.length}`,
      durationSec: 5,
      round: 1,
      totalRounds: session.rounds,
      exerciseIndex: 1,
      totalExercises: session.exercises.length,
      bell: first.bell,
      nextTitle: first.name,
      glossaryName: first.name,
    })
  }

  for (let round = 1; round <= session.rounds; round += 1) {
    session.exercises.forEach((exercise, index) => {
      const nextExercise =
        session.exercises[index + 1] ??
        (round < session.rounds ? session.exercises[0] : undefined)
      const last =
        round === session.rounds && index === session.exercises.length - 1
      const glossary = matchGlossary(exercise.name, program.glossary)

      segments.push({
        kind: 'work',
        title: exercise.name,
        subtitle: `Round ${round}/${session.rounds} · Move ${index + 1}/${session.exercises.length}`,
        durationSec: exercise.workSec,
        round,
        totalRounds: session.rounds,
        exerciseIndex: index + 1,
        totalExercises: session.exercises.length,
        bell: exercise.bell,
        nextTitle: last ? undefined : `Rest ${exercise.restSec}s`,
        glossaryName: glossary?.name ?? exercise.name,
      })

      if (!last) {
        const nextName = nextExercise?.name ?? 'Next'
        segments.push({
          kind: 'rest',
          title: 'Rest',
          subtitle: `Round ${round}/${session.rounds} · Move ${index + 1}/${session.exercises.length}`,
          durationSec: Math.max(exercise.restSec, 0),
          round,
          totalRounds: session.rounds,
          exerciseIndex: index + 1,
          totalExercises: session.exercises.length,
          nextTitle: nextName,
          glossaryName: nextExercise?.name,
        })
      }
    })
  }

  return segments
}
