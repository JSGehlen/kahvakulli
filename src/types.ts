export type WorkoutType = 'regular' | 'emom' | 'circuit'

export type SessionMode = WorkoutType

export const WORKOUT_TYPES: WorkoutType[] = ['regular', 'emom', 'circuit']

export type Exercise = {
  name: string
  workSec: number
  restSec: number
  reps?: number
  target?: string
  bell?: string
  notes: string[]
  glossaryId?: string
}

export type Session = {
  id: string
  name: string
  rounds: number
  type: WorkoutType
  types: WorkoutType[]
  roundRestSec?: number
  exercises: Exercise[]
  userId?: string | null
  isBuiltin?: boolean
}

export type WarmupStep = {
  name: string
  durationSec: number
}

export type Warmup = {
  label: string
  totalSec: number
  steps: WarmupStep[]
}

export type ScheduleRow = {
  day: string
  workout: string
}

export type GlossaryEntry = {
  id: string
  name: string
  steps: string[]
  notes: string[]
  isBuiltin?: boolean
}

export type WeightRef = {
  exercise: string
  bell: string
}

export type ProgramPhase = {
  month: number
  name: string
  focus?: string
  schedule: ScheduleRow[]
  sessions: Session[]
}

export type Program = {
  id: string
  title: string
  equipment: string[]
  duration?: string
  difficulty?: string
  focus?: string
  stage?: string
  schedule: ScheduleRow[]
  warmup?: Warmup
  sessions: Session[]
  phases: ProgramPhase[]
  glossary: GlossaryEntry[]
  weightReference: WeightRef[]
  sourceFile: string
  userId?: string | null
  isBuiltin?: boolean
  isPublic?: boolean
  ownerName?: string
}

export type ProgramProgress = {
  currentMonth: number
  completions: Record<string, number>
  startedAt?: string
}

export type Profile = {
  id: string
  displayName: string
  isAdmin: boolean
}

export type SegmentKind = 'warmup' | 'prepare' | 'work' | 'rest'

export type Segment = {
  kind: SegmentKind
  title: string
  subtitle?: string
  durationSec: number
  round?: number
  totalRounds?: number
  exerciseIndex?: number
  totalExercises?: number
  bell?: string
  reps?: number
  target?: string
  nextTitle?: string
  glossaryName?: string
  awaitComplete?: boolean
  hideWorkClock?: boolean
}

export const DEFAULT_WARMUP: Warmup = {
  label: 'Repeat for 4 minutes',
  totalSec: 240,
  steps: [
    { name: 'March or jog on the spot', durationSec: 30 },
    { name: 'Slow bodyweight squats', durationSec: 15 },
    { name: 'Arm circles', durationSec: 15 },
  ],
}
