import { supabase } from './supabase.ts'
import type {
  Exercise,
  ExerciseLog,
  GlossaryEntry,
  LogEntry,
  Profile,
  Program,
  ProgramPhase,
  ProgramProgress,
  Session,
  Warmup,
  WorkoutType,
} from './types.ts'

function asWorkoutType(value: unknown): WorkoutType {
  if (value === 'emom' || value === 'circuit') return value
  return 'regular'
}

function throwIfError(error: { message: string; details?: string; hint?: string } | null): void {
  if (!error) return
  throw new Error([error.message, error.details, error.hint].filter(Boolean).join(' — '))
}

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

type WorkoutRow = {
  id: string
  user_id: string | null
  name: string
  rounds: number
  type: string | null
  types: string[] | null
  round_rest_sec: number | null
  is_builtin: boolean
  is_public: boolean
}

type ExerciseRow = {
  workout_id: string
  glossary_id: string | null
  name: string
  sort: number
  work_sec: number
  rest_sec: number
  reps: number | null
  target: string | null
  bell: string | null
  notes: string[] | null
  sets: number | null
}

type ProgramRow = {
  id: string
  user_id: string | null
  title: string
  stage: string | null
  duration: string | null
  difficulty: string | null
  focus: string | null
  equipment: string[] | null
  warmup: Warmup | null
  phases: { month: number; name: string; focus?: string }[] | null
  is_builtin: boolean
  is_public: boolean
  sort: number
  profiles?: { display_name: string | null } | null
}

function toExercise(row: ExerciseRow): Exercise {
  return {
    name: row.name,
    workSec: row.work_sec,
    restSec: row.rest_sec,
    reps: row.reps ?? undefined,
    target: row.target ?? undefined,
    bell: row.bell ?? undefined,
    notes: row.notes ?? [],
    sets: row.sets ?? undefined,
    glossaryId: row.glossary_id ?? undefined,
  }
}

function asWorkoutTypes(
  value: unknown,
  fallback: WorkoutType,
  exercises: ExerciseRow[],
): WorkoutType[] {
  const listed = Array.isArray(value)
    ? value.filter(
        (item): item is WorkoutType =>
          item === 'regular' || item === 'emom' || item === 'circuit',
      )
    : []
  const base = listed.length > 0 ? listed : [fallback]
  const dual =
    base.includes('regular') &&
    !base.includes('emom') &&
    exercises.length > 0 &&
    exercises.every((item) => Boolean(item.reps)) &&
    exercises.some((item) => item.work_sec > 0)
  const ordered = (['regular', 'emom', 'circuit'] as const).filter(
    (item) => base.includes(item) || (dual && item === 'emom'),
  )
  return ordered.length > 0 ? [...ordered] : ['regular']
}

function toSession(row: WorkoutRow, exercises: ExerciseRow[]): Session {
  const mapped = exercises.filter((item) => item.workout_id === row.id)
  const types = asWorkoutTypes(row.types, asWorkoutType(row.type), mapped)
  return {
    id: row.id,
    name: row.name,
    rounds: row.rounds,
    type: types[0] ?? 'regular',
    types,
    roundRestSec: row.round_rest_sec ?? undefined,
    userId: row.user_id,
    isBuiltin: row.is_builtin,
    exercises: mapped.sort((a, b) => a.sort - b.sort).map(toExercise),
  }
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  const client = requireClient()
  const { data, error } = await client
    .from('profiles')
    .select('id, display_name, is_admin')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    displayName: data.display_name ?? 'You',
    isAdmin: Boolean(data.is_admin),
  }
}

export async function loadGlossary(): Promise<GlossaryEntry[]> {
  const client = requireClient()
  const { data, error } = await client
    .from('glossary_entries')
    .select('id, name, steps, notes, is_builtin')
    .order('name')
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    steps: row.steps ?? [],
    notes: row.notes ?? [],
    isBuiltin: row.is_builtin,
  }))
}

export async function saveGlossaryEntry(
  entry: { id?: string; name: string; steps: string[]; notes: string[] },
): Promise<GlossaryEntry> {
  const client = requireClient()
  const payload = {
    name: entry.name.trim(),
    steps: entry.steps.map((step) => step.trim()).filter(Boolean),
    notes: entry.notes.map((note) => note.trim()).filter(Boolean),
    is_builtin: false,
    updated_at: new Date().toISOString(),
  }
  const query = entry.id
    ? client.from('glossary_entries').update(payload).eq('id', entry.id)
    : client.from('glossary_entries').insert(payload)
  const { data, error } = await query.select('id, name, steps, notes, is_builtin').single()
  if (error) throw error
  return {
    id: data.id,
    name: data.name,
    steps: data.steps ?? [],
    notes: data.notes ?? [],
    isBuiltin: data.is_builtin,
  }
}

export async function deleteGlossaryEntry(id: string): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('glossary_entries').delete().eq('id', id)
  if (error) throw error
}

export async function loadWorkouts(): Promise<Session[]> {
  const client = requireClient()
  const { data: workouts, error } = await client
    .from('workouts')
    .select('id, user_id, name, rounds, type, types, round_rest_sec, is_builtin, is_public')
    .order('name')
  if (error) throw error
  const ids = (workouts ?? []).map((row) => row.id)
  const { data: exercises, error: exerciseError } = ids.length
    ? await client
        .from('workout_exercises')
        .select('workout_id, glossary_id, name, sort, work_sec, rest_sec, reps, target, bell, notes, sets')
        .in('workout_id', ids)
    : { data: [], error: null }
  if (exerciseError) throw exerciseError
  return (workouts ?? []).map((row) => toSession(row, (exercises ?? []) as ExerciseRow[]))
}

export async function saveWorkout(input: {
  id?: string
  name: string
  rounds: number
  types: WorkoutType[]
  roundRestSec?: number
  userId: string
  exercises: Exercise[]
}): Promise<Session> {
  const client = requireClient()
  const types =
    input.types.length > 0 ? input.types : (['regular'] as WorkoutType[])
  const payload = {
    name: input.name.trim(),
    rounds: Math.max(1, input.rounds),
    type: types[0],
    types,
    round_rest_sec: Math.max(0, input.roundRestSec ?? 0),
    user_id: input.userId,
    is_builtin: false,
    is_public: false,
  }
  const { data: workout, error } = input.id
    ? await client.from('workouts').update(payload).eq('id', input.id).select().single()
    : await client.from('workouts').insert(payload).select().single()
  if (error) throw error
  await client.from('workout_exercises').delete().eq('workout_id', workout.id)
  if (input.exercises.length > 0) {
    const { error: insertError } = await client.from('workout_exercises').insert(
      input.exercises.map((exercise, sort) => ({
        workout_id: workout.id,
        glossary_id: exercise.glossaryId ?? null,
        name: exercise.name,
        sort,
        work_sec: exercise.workSec,
        rest_sec: exercise.restSec,
        reps: exercise.reps ?? null,
        target: exercise.target ?? null,
        bell: exercise.bell ?? null,
        notes: exercise.notes,
        sets: exercise.sets ?? null,
      })),
    )
    if (insertError) throw insertError
  }
  return toSession(workout as WorkoutRow, input.exercises.map((exercise, sort) => ({
    workout_id: workout.id,
    glossary_id: exercise.glossaryId ?? null,
    name: exercise.name,
    sort,
    work_sec: exercise.workSec,
    rest_sec: exercise.restSec,
    reps: exercise.reps ?? null,
    target: exercise.target ?? null,
    bell: exercise.bell ?? null,
    notes: exercise.notes,
    sets: exercise.sets ?? null,
  })))
}

export async function deleteWorkout(id: string): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('workouts').delete().eq('id', id)
  if (error) throw error
}

export async function loadPrograms(glossary: GlossaryEntry[]): Promise<Program[]> {
  const client = requireClient()
  const { data: programRows, error } = await client
    .from('programs')
    .select(
      'id, user_id, title, stage, duration, difficulty, focus, equipment, warmup, phases, is_builtin, is_public, sort',
    )
    .order('sort')
    .order('title')
  if (error) throw error
  const programs = (programRows ?? []) as ProgramRow[]
  const ids = programs.map((row) => row.id)
  if (ids.length === 0) return []

  const ownerIds = [
    ...new Set(programs.map((row) => row.user_id).filter((id): id is string => Boolean(id))),
  ]
  const [linkRes, scheduleRes, workoutRes, exerciseRes, ownerRes] = await Promise.all([
    client.from('program_workouts').select('program_id, workout_id, sort, month').in('program_id', ids),
    client.from('program_schedule').select('program_id, day, workout_id, month').in('program_id', ids),
    client.from('workouts').select('id, user_id, name, rounds, type, types, round_rest_sec, is_builtin, is_public'),
    client
      .from('workout_exercises')
      .select('workout_id, glossary_id, name, sort, work_sec, rest_sec, reps, target, bell, notes, sets'),
    ownerIds.length
      ? client.from('profiles').select('id, display_name').in('id', ownerIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[], error: null }),
  ])
  throwIfError(linkRes.error)
  throwIfError(scheduleRes.error)
  throwIfError(workoutRes.error)
  throwIfError(exerciseRes.error)
  throwIfError(ownerRes.error)
  const links = (linkRes.data ?? []) as {
    program_id: string
    workout_id: string
    sort: number
    month: number | null
  }[]
  const schedule = (scheduleRes.data ?? []) as {
    program_id: string
    day: string
    workout_id: string
    month: number | null
  }[]
  const workouts = workoutRes.data
  const exercises = exerciseRes.data
  const owners = ownerRes.data
  const ownerName = new Map(
    (owners ?? []).map((row) => [row.id, row.display_name ?? undefined]),
  )

  const workoutById = new Map(
    ((workouts ?? []) as WorkoutRow[]).map((row) => [
      row.id,
      toSession(row, (exercises ?? []) as ExerciseRow[]),
    ]),
  )

  return programs.map((row) => {
    const programLinks = (links ?? [])
      .filter((link) => link.program_id === row.id)
      .sort((a, b) => (a.month ?? 1) - (b.month ?? 1) || a.sort - b.sort)
    const sessions = programLinks
      .map((link) => workoutById.get(link.workout_id))
      .filter((session): session is Session => Boolean(session))
    const byId = new Map(sessions.map((session) => [session.id, session]))
    const months = new Set(programLinks.map((link) => link.month ?? 1))
    for (const item of schedule ?? []) {
      if (item.program_id === row.id) months.add(item.month ?? 1)
    }
    const metas =
      Array.isArray(row.phases) && row.phases.length > 0
        ? row.phases
        : [...months]
            .sort((a, b) => a - b)
            .map((month) => ({ month, name: row.stage ?? row.title, focus: row.focus ?? undefined }))
    const phases: ProgramPhase[] = metas.map((meta) => {
      const monthLinks = programLinks.filter((link) => (link.month ?? 1) === meta.month)
      const monthSessions = monthLinks
        .map((link) => workoutById.get(link.workout_id))
        .filter((session): session is Session => Boolean(session))
      const monthById = new Map(monthSessions.map((session) => [session.id, session]))
      return {
        month: meta.month,
        name: meta.name,
        focus: meta.focus,
        sessions: monthSessions,
        schedule: (schedule ?? [])
          .filter((item) => item.program_id === row.id && (item.month ?? 1) === meta.month)
          .map((item) => ({
            day: item.day,
            workout: monthById.get(item.workout_id)?.name ?? byId.get(item.workout_id)?.name ?? '',
          })),
      }
    })
    const first = phases[0]
    return {
      id: row.id,
      title: row.title,
      stage: row.stage ?? undefined,
      duration: row.duration ?? undefined,
      difficulty: row.difficulty ?? undefined,
      focus: row.focus ?? undefined,
      equipment: row.equipment ?? [],
      warmup: row.warmup ?? undefined,
      schedule: first?.schedule ?? [],
      sessions,
      phases,
      glossary,
      weightReference: [],
      sourceFile: '',
      userId: row.user_id,
      isBuiltin: row.is_builtin,
      isPublic: row.is_public,
      ownerName: row.user_id ? ownerName.get(row.user_id) : undefined,
    }
  })
}

export async function saveProgram(input: {
  id?: string
  userId: string
  title: string
  stage?: string
  duration?: string
  difficulty?: string
  focus?: string
  equipment: string[]
  warmup?: Warmup
  isPublic: boolean
  workoutIds: string[]
  schedule: { day: string; workoutId: string }[]
}): Promise<string> {
  const client = requireClient()
  const payload = {
    user_id: input.userId,
    title: input.title.trim(),
    stage: input.stage?.trim() || null,
    duration: input.duration?.trim() || null,
    difficulty: input.difficulty?.trim() || null,
    focus: input.focus?.trim() || null,
    equipment: input.equipment.map((item) => item.trim()).filter(Boolean),
    warmup: input.warmup ?? null,
    is_public: input.isPublic,
    is_builtin: false,
  }
  const { data: program, error } = input.id
    ? await client.from('programs').update(payload).eq('id', input.id).select('id').single()
    : await client.from('programs').insert(payload).select('id').single()
  if (error) throw error

  await client.from('program_workouts').delete().eq('program_id', program.id)
  await client.from('program_schedule').delete().eq('program_id', program.id)

  if (input.workoutIds.length > 0) {
    const { error: linkError } = await client.from('program_workouts').insert(
      input.workoutIds.map((workout_id, sort) => ({
        program_id: program.id,
        workout_id,
        sort,
        month: 1,
      })),
    )
    if (linkError) throw linkError
  }
  if (input.schedule.length > 0) {
    const { error: scheduleError } = await client.from('program_schedule').insert(
      input.schedule.map((row) => ({
        program_id: program.id,
        day: row.day,
        workout_id: row.workoutId,
        month: 1,
      })),
    )
    if (scheduleError) throw scheduleError
  }
  return program.id
}

export async function deleteProgram(id: string): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('programs').delete().eq('id', id)
  if (error) throw error
}

function toCompletions(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const completions: Record<string, number> = {}
  for (const [id, count] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(count)
    if (Number.isFinite(n) && n > 0) completions[id] = n
  }
  return completions
}

const PROGRESS_COLUMNS =
  'program_id, current_month, completions, started_at, month_started_at, training_week, week_done_ids, last_active_at'

type ProgressRow = {
  program_id: string
  current_month: number | null
  completions: unknown
  started_at: string | null
  month_started_at: string | null
  training_week: number | null
  week_done_ids: string[] | null
  last_active_at: string | null
}

function toProgress(row: ProgressRow): ProgramProgress {
  return {
    currentMonth: Math.max(1, Number(row.current_month) || 1),
    completions: toCompletions(row.completions),
    startedAt: row.started_at ?? undefined,
    monthStartedAt: row.month_started_at ?? undefined,
    trainingWeek: Math.max(1, Number(row.training_week) || 1),
    weekDoneIds: row.week_done_ids ?? [],
    lastActiveAt: row.last_active_at ?? undefined,
  }
}

async function readProgress(userId: string, programId: string): Promise<ProgressRow | null> {
  const client = requireClient()
  const { data, error } = await client
    .from('program_progress')
    .select(PROGRESS_COLUMNS)
    .eq('user_id', userId)
    .eq('program_id', programId)
    .maybeSingle()
  if (error) throw error
  return data as ProgressRow | null
}

export async function loadProgramProgress(
  userId: string,
): Promise<Record<string, ProgramProgress>> {
  const client = requireClient()
  const { data, error } = await client
    .from('program_progress')
    .select(PROGRESS_COLUMNS)
    .eq('user_id', userId)
  if (error) throw error
  const byProgram: Record<string, ProgramProgress> = {}
  for (const row of (data ?? []) as ProgressRow[]) {
    byProgram[row.program_id] = toProgress(row)
  }
  return byProgram
}

/**
 * Records a finished session. The training week moves on once you've done
 * `sessionsPerWeek` sessions in it, however many calendar days that took.
 */
export async function markWorkoutDone(
  userId: string,
  programId: string,
  workoutId: string,
  sessionsPerWeek: number,
): Promise<Record<string, ProgramProgress>> {
  const client = requireClient()
  const row = await readProgress(userId, programId)
  const now = new Date().toISOString()
  const completions = toCompletions(row?.completions)
  completions[workoutId] = (completions[workoutId] ?? 0) + 1

  let trainingWeek = Math.max(1, Number(row?.training_week) || 1)
  let weekDoneIds = [...(row?.week_done_ids ?? []), workoutId]
  if (weekDoneIds.length >= Math.max(1, sessionsPerWeek)) {
    trainingWeek += 1
    weekDoneIds = []
  }

  const { error } = await client.from('program_progress').upsert({
    user_id: userId,
    program_id: programId,
    current_month: Math.max(1, Number(row?.current_month) || 1),
    completions,
    started_at: row?.started_at ?? now,
    month_started_at: row?.month_started_at ?? row?.started_at ?? now,
    training_week: trainingWeek,
    week_done_ids: weekDoneIds,
    last_active_at: now,
    updated_at: now,
  })
  if (error) throw error
  return loadProgramProgress(userId)
}

/** Back after a break: keep going, or set the week to repeat. */
export async function resumeProgram(
  userId: string,
  programId: string,
  trainingWeek: number,
  clearWeek: boolean,
): Promise<Record<string, ProgramProgress>> {
  const client = requireClient()
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    training_week: Math.max(1, trainingWeek),
    last_active_at: now,
    updated_at: now,
  }
  if (clearWeek) patch.week_done_ids = []
  const { error } = await client
    .from('program_progress')
    .update(patch)
    .eq('user_id', userId)
    .eq('program_id', programId)
  if (error) throw error
  return loadProgramProgress(userId)
}

export async function startProgram(
  userId: string,
  programId: string,
): Promise<Record<string, ProgramProgress>> {
  const client = requireClient()
  const now = new Date().toISOString()
  const { error } = await client.from('program_progress').upsert({
    user_id: userId,
    program_id: programId,
    current_month: 1,
    completions: {},
    started_at: now,
    month_started_at: now,
    training_week: 1,
    week_done_ids: [],
    last_active_at: now,
    updated_at: now,
  })
  if (error) throw error
  return loadProgramProgress(userId)
}

export async function endProgram(
  userId: string,
  programId: string,
): Promise<Record<string, ProgramProgress>> {
  const client = requireClient()
  const { error } = await client
    .from('program_progress')
    .delete()
    .eq('user_id', userId)
    .eq('program_id', programId)
  if (error) throw error
  return loadProgramProgress(userId)
}

export async function advanceProgramMonth(
  userId: string,
  programId: string,
  nextMonth: number,
): Promise<Record<string, ProgramProgress>> {
  const client = requireClient()
  const row = await readProgress(userId, programId)
  const now = new Date().toISOString()
  const { error } = await client.from('program_progress').upsert({
    user_id: userId,
    program_id: programId,
    current_month: nextMonth,
    completions: {},
    started_at: row?.started_at ?? now,
    month_started_at: now,
    training_week: 1,
    week_done_ids: [],
    last_active_at: now,
    updated_at: now,
  })
  if (error) throw error
  return loadProgramProgress(userId)
}

/** Latest log per move name (lower-cased), newest first. */
export async function loadLastLogs(userId: string): Promise<Record<string, ExerciseLog>> {
  const client = requireClient()
  const { data, error } = await client
    .from('exercise_logs')
    .select('exercise_name, bell, reps, logged_at')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(500)
  if (error) throw error
  const latest: Record<string, ExerciseLog> = {}
  for (const row of data ?? []) {
    const key = String(row.exercise_name).trim().toLowerCase()
    if (latest[key]) continue
    latest[key] = {
      exerciseName: row.exercise_name,
      bell: row.bell ?? undefined,
      reps: row.reps ?? undefined,
      loggedAt: row.logged_at,
    }
  }
  return latest
}

export async function saveExerciseLogs(
  userId: string,
  programId: string,
  workoutId: string,
  entries: LogEntry[],
): Promise<void> {
  const rows = entries
    .filter((entry) => entry.bell || entry.reps !== undefined)
    .map((entry) => ({
      user_id: userId,
      program_id: programId,
      workout_id: workoutId,
      exercise_name: entry.exerciseName,
      bell: entry.bell ?? null,
      reps: entry.reps ?? null,
    }))
  if (rows.length === 0) return
  const client = requireClient()
  const { error } = await client.from('exercise_logs').insert(rows)
  if (error) throw error
}
