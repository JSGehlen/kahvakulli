import { matchGlossary } from './parseWorkout.ts'
import type { Exercise, Program, Segment, Session, SessionMode } from './types.ts'

export function intervalFor(exercise: Exercise, mode: SessionMode) {
  if (mode === 'emom') {
    return { workSec: 60, restSec: 0 }
  }
  return { workSec: exercise.workSec, restSec: exercise.restSec }
}

export function estimateSessionSeconds(
  session: Session,
  warmupSec = 0,
  includeWarmup = false,
  mode: SessionMode = 'regular',
): number {
  let total = includeWarmup ? warmupSec : 0
  total += 5
  for (let round = 1; round <= session.rounds; round += 1) {
    session.exercises.forEach((exercise, index) => {
      const { workSec, restSec } = intervalFor(exercise, mode)
      total += workSec
      const last =
        round === session.rounds && index === session.exercises.length - 1
      if (!last) total += Math.max(restSec, 0)
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

export function sessionMinutes(
  program: Program,
  session: Session,
  includeWarmup = true,
  mode: SessionMode = 'regular',
): number {
  return Math.max(
    1,
    Math.round(
      estimateSessionSeconds(session, program.warmup?.totalSec, includeWarmup, mode) / 60,
    ),
  )
}

export function formatWarmupMeta(totalSec: number): string {
  const minutes = Math.max(1, Math.round(totalSec / 60))
  return `Repeats for ${minutes} min`
}

export function buildTimeline(
  program: Program,
  session: Session,
  includeWarmup: boolean,
  mode: SessionMode = 'regular',
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
          subtitle: formatWarmupMeta(warmup.totalSec),
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
          reps: first.reps,
          target: first.target,
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
      const minute =
        (round - 1) * session.exercises.length + index + 1
      const totalMinutes = session.rounds * session.exercises.length

      if (mode === 'emom') {
        segments.push({
          kind: 'work',
          title: exercise.name,
          subtitle: `Minute ${minute}/${totalMinutes} · Round ${round}/${session.rounds}`,
          durationSec: 60,
          round,
          totalRounds: session.rounds,
          exerciseIndex: index + 1,
          totalExercises: session.exercises.length,
          bell: exercise.bell,
          reps: exercise.reps,
          target: exercise.target,
          nextTitle: last ? undefined : nextExercise?.name,
          glossaryName: glossary?.name ?? exercise.name,
        })
        return
      }

      const { workSec, restSec } = intervalFor(exercise, mode)

      segments.push({
        kind: 'work',
        title: exercise.name,
        subtitle: `Round ${round}/${session.rounds} · Move ${index + 1}/${session.exercises.length}`,
        durationSec: workSec,
        round,
        totalRounds: session.rounds,
        exerciseIndex: index + 1,
        totalExercises: session.exercises.length,
        bell: exercise.bell,
        reps: exercise.reps,
        target: exercise.target,
        nextTitle: last ? undefined : `Rest ${restSec}s`,
        glossaryName: glossary?.name ?? exercise.name,
      })

      if (!last) {
        const nextName = nextExercise?.name ?? 'Next'
        segments.push({
          kind: 'rest',
          title: 'Breathe',
          subtitle: `Round ${round}/${session.rounds} · Move ${index + 1}/${session.exercises.length}`,
          durationSec: Math.max(restSec, 0),
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
