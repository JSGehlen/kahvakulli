export type Exercise = {
  name: string
  workSec: number
  restSec: number
  reps?: number
  target?: string
  bell?: string
  notes: string[]
}

export type Session = {
  id: string
  name: string
  rounds: number
  exercises: Exercise[]
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
  name: string
  steps: string[]
  notes: string[]
}

export type WeightRef = {
  exercise: string
  bell: string
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
  glossary: GlossaryEntry[]
  weightReference: WeightRef[]
  sourceFile: string
}

export type SessionMode = 'regular' | 'emom'

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
}
