import { matchGlossary } from './parseWorkout.ts'
import type { Exercise, Program, Segment, Session, SessionMode, WorkoutType } from './types.ts'
import { WORKOUT_TYPES } from './types.ts'

export function workoutTypeLabel(type: WorkoutType): string {
  if (type === 'emom') return 'EMOM'
  if (type === 'circuit') return 'Circuit'
  return 'Regular'
}

export function orderedTypes(types: WorkoutType[]): WorkoutType[] {
  return WORKOUT_TYPES.filter((type) => types.includes(type))
}

export function sessionTypes(session: Session): WorkoutType[] {
  const listed =
    session.types?.length > 0 ? session.types : [session.type ?? 'regular']
  const dual =
    listed.includes('regular') &&
    !listed.includes('emom') &&
    session.exercises.some((exercise) => Boolean(exercise.reps) && exercise.workSec > 0)
  return orderedTypes(dual ? [...listed, 'emom'] : listed)
}

export function playableTypes(sessions: Session[]): WorkoutType[] {
  return orderedTypes([...new Set(sessions.flatMap(sessionTypes))])
}

export function usesReps(exercise: Exercise): boolean {
  return Boolean(exercise.reps) && !(exercise.workSec > 0)
}

export function effectiveType(
  session: Session,
  playAs: SessionMode = 'regular',
): WorkoutType {
  const available = sessionTypes(session)
  if (available.includes(playAs)) return playAs
  return available[0] ?? 'regular'
}

function circuitRest(session: Session): number {
  return session.roundRestSec ?? session.exercises.at(-1)?.restSec ?? 0
}

export function exerciseLine(
  session: Session,
  exercise: Exercise,
  playAs: SessionMode = 'regular',
): string {
  const type = effectiveType(session, playAs)
  if (type === 'emom') {
    return [exercise.reps ? `${exercise.reps} reps` : exercise.target, 'On the minute', exercise.bell]
      .filter(Boolean)
      .join(' · ')
  }
  if (type === 'circuit' || usesReps(exercise)) {
    return [
      exercise.reps ? `${exercise.reps} reps` : exercise.target,
      type !== 'circuit' && exercise.restSec > 0 ? `${exercise.restSec}s rest` : undefined,
      exercise.bell,
    ]
      .filter(Boolean)
      .join(' · ')
  }
  return [`${exercise.workSec}s work`, `${exercise.restSec}s rest`, exercise.target, exercise.bell]
    .filter(Boolean)
    .join(' · ')
}

export function estimateSessionSeconds(
  session: Session,
  warmupSec = 0,
  includeWarmup = false,
  playAs: SessionMode = 'regular',
): number {
  let total = includeWarmup ? warmupSec : 0
  total += 5
  const lastRest = circuitRest(session)
  const type = effectiveType(session, playAs)

  if (type === 'emom') {
    return total + session.rounds * session.exercises.length * 60
  }

  for (let round = 1; round <= session.rounds; round += 1) {
    session.exercises.forEach((exercise, index) => {
      const last =
        round === session.rounds && index === session.exercises.length - 1
      if (type === 'circuit') {
        const lastOfRound = index === session.exercises.length - 1
        if (lastOfRound && !last) total += Math.max(lastRest, 0)
        return
      }
      if (!usesReps(exercise)) total += exercise.workSec
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

export function sessionMinutes(
  program: Program,
  session: Session,
  includeWarmup = true,
  playAs: SessionMode = 'regular',
): number {
  return Math.max(
    1,
    Math.round(
      estimateSessionSeconds(session, program.warmup?.totalSec, includeWarmup, playAs) / 60,
    ),
  )
}

export function formatWarmupMeta(totalSec: number): string {
  const minutes = Math.max(1, Math.round(totalSec / 60))
  return `Repeats for ${minutes} min`
}

function baseWork(
  exercise: Exercise,
  program: Program,
  round: number,
  rounds: number,
  index: number,
  totalExercises: number,
  subtitle: string,
  nextTitle: string | undefined,
  extra: Partial<Segment>,
): Segment {
  const glossary = matchGlossary(exercise.name, program.glossary)
  return {
    kind: 'work',
    title: exercise.name,
    subtitle,
    durationSec: extra.durationSec ?? exercise.workSec,
    round,
    totalRounds: rounds,
    exerciseIndex: index + 1,
    totalExercises,
    bell: exercise.bell,
    reps: exercise.reps,
    target: exercise.target,
    nextTitle,
    glossaryName: glossary?.name ?? exercise.name,
    ...extra,
  }
}

export function buildTimeline(
  program: Program,
  session: Session,
  includeWarmup: boolean,
  playAs: SessionMode = 'regular',
): Segment[] {
  const segments: Segment[] = []
  const first = session.exercises[0]
  const type = effectiveType(session, playAs)
  const totalExercises = session.exercises.length

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
      subtitle: `Round 1/${session.rounds} · Move 1/${totalExercises}`,
      durationSec: 5,
      round: 1,
      totalRounds: session.rounds,
      exerciseIndex: 1,
      totalExercises,
      bell: first.bell,
      reps: first.reps,
      target: first.target,
      nextTitle: first.name,
      glossaryName: first.name,
    })
  }

  const lastRest = circuitRest(session)

  for (let round = 1; round <= session.rounds; round += 1) {
    session.exercises.forEach((exercise, index) => {
      const nextExercise =
        session.exercises[index + 1] ??
        (round < session.rounds ? session.exercises[0] : undefined)
      const last =
        round === session.rounds && index === session.exercises.length - 1
      const lastOfRound = index === session.exercises.length - 1
      const subtitle = `Round ${round}/${session.rounds} · Move ${index + 1}/${totalExercises}`

      if (type === 'emom') {
        const minute = (round - 1) * totalExercises + index + 1
        const totalMinutes = session.rounds * totalExercises
        segments.push(
          baseWork(
            exercise,
            program,
            round,
            session.rounds,
            index,
            totalExercises,
            `Minute ${minute}/${totalMinutes} · Round ${round}/${session.rounds}`,
            last ? undefined : nextExercise?.name,
            { durationSec: 60, hideWorkClock: true },
          ),
        )
        return
      }

      if (type === 'circuit') {
        segments.push(
          baseWork(
            exercise,
            program,
            round,
            session.rounds,
            index,
            totalExercises,
            subtitle,
            last
              ? undefined
              : lastOfRound
                ? `Rest ${lastRest}s`
                : nextExercise?.name,
            { durationSec: 0, awaitComplete: true },
          ),
        )
        if (lastOfRound && !last && lastRest > 0) {
          segments.push({
            kind: 'rest',
            title: 'Breathe',
            subtitle: `Round ${round}/${session.rounds}`,
            durationSec: Math.max(lastRest, 0),
            round,
            totalRounds: session.rounds,
            nextTitle: session.exercises[0]?.name,
            glossaryName: session.exercises[0]?.name,
          })
        }
        return
      }

      const timed = !usesReps(exercise)
      const restSec = exercise.restSec
      segments.push(
        baseWork(
          exercise,
          program,
          round,
          session.rounds,
          index,
          totalExercises,
          subtitle,
          last ? undefined : timed || restSec > 0 ? `Rest ${restSec}s` : nextExercise?.name,
          timed
            ? { durationSec: exercise.workSec }
            : { durationSec: 0, awaitComplete: true },
        ),
      )

      if (!last && restSec > 0) {
        segments.push({
          kind: 'rest',
          title: 'Breathe',
          subtitle,
          durationSec: Math.max(restSec, 0),
          round,
          totalRounds: session.rounds,
          exerciseIndex: index + 1,
          totalExercises,
          nextTitle: nextExercise?.name ?? 'Next',
          glossaryName: nextExercise?.name,
        })
      }
    })
  }

  return segments
}
