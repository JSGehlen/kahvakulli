import type { Segment } from './types.ts'

const KEY = 'kettlebell:active-session'
const LAST_PROGRAM_KEY = 'kettlebell:last-program'

export type SavedWorkout = {
  version: 1
  programId: string
  sessionId: string
  includeWarmup: boolean
  index: number
  remainingMs: number
  status: 'running' | 'paused' | 'done'
  savedAt: number
}

export type RestoredTimer = {
  index: number
  remainingMs: number
  status: 'running' | 'paused' | 'done'
}

export function loadSavedWorkout(): SavedWorkout | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedWorkout
    if (parsed.version !== 1) return null
    if (!parsed.programId || !parsed.sessionId) return null
    return parsed
  } catch {
    return null
  }
}

export function saveWorkout(snapshot: SavedWorkout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot))
  } catch {
    // Private mode or full storage should not break the timer.
  }
}

export function clearSavedWorkout(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function loadLastProgramId(): string | null {
  try {
    return localStorage.getItem(LAST_PROGRAM_KEY)
  } catch {
    return null
  }
}

export function saveLastProgramId(id: string): void {
  try {
    localStorage.setItem(LAST_PROGRAM_KEY, id)
  } catch {
    // Ignore storage failures.
  }
}

const WEEK_KEY = 'kettlebell:week-progress'

export type WeekProgress = {
  weekStart: string
  byProgram: Record<string, string[]>
}

export function mondayKey(date = new Date()): string {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  const day = copy.getDay()
  const offset = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + offset)
  const year = copy.getFullYear()
  const month = `${copy.getMonth() + 1}`.padStart(2, '0')
  const dateNum = `${copy.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${dateNum}`
}

export function emptyWeekProgress(): WeekProgress {
  return { weekStart: mondayKey(), byProgram: {} }
}

export function loadWeekProgress(): WeekProgress {
  try {
    const raw = localStorage.getItem(WEEK_KEY)
    if (!raw) return emptyWeekProgress()
    const parsed = JSON.parse(raw) as WeekProgress
    if (parsed.weekStart !== mondayKey()) return emptyWeekProgress()
    return parsed
  } catch {
    return emptyWeekProgress()
  }
}

export function saveWeekProgress(progress: WeekProgress): void {
  try {
    localStorage.setItem(WEEK_KEY, JSON.stringify(progress))
  } catch {
    // Ignore storage failures.
  }
}

export function markSessionDone(
  progress: WeekProgress,
  programId: string,
  sessionId: string,
): WeekProgress {
  const current = progress.weekStart === mondayKey() ? progress : emptyWeekProgress()
  const done = new Set(current.byProgram[programId] ?? [])
  done.add(sessionId)
  const next = {
    ...current,
    byProgram: { ...current.byProgram, [programId]: [...done] },
  }
  saveWeekProgress(next)
  return next
}

export function replayElapsed(saved: SavedWorkout, segments: Segment[]): RestoredTimer {
  if (saved.status !== 'running') {
    return {
      index: Math.min(saved.index, Math.max(0, segments.length - 1)),
      remainingMs: Math.max(0, saved.remainingMs),
      status: saved.status,
    }
  }

  let index = saved.index
  let remainingMs = saved.remainingMs - Math.max(0, Date.now() - saved.savedAt)

  while (remainingMs <= 0) {
    index += 1
    if (index >= segments.length) {
      return { index: Math.max(0, segments.length - 1), remainingMs: 0, status: 'done' }
    }
    remainingMs += segments[index].durationSec * 1000
  }

  return { index, remainingMs, status: 'running' }
}
