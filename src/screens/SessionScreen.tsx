import { useEffect, useMemo, useRef, useState } from 'react'
import { matchGlossaryEntries } from '../parseWorkout.ts'
import type { RestoredTimer } from '../persist.ts'
import { formatClock } from '../timeline.ts'
import {
  bellLabel,
  defaultBell,
  formatLog,
  isTimed,
  logKey,
  ownedBells,
  progressionHint,
  repRange,
} from '../progression.ts'
import type {
  ExerciseLog,
  GlossaryEntry,
  LogEntry,
  Program,
  Segment,
  Session,
  WorkoutType,
} from '../types.ts'
import { useSession } from '../useSession.ts'

type Props = {
  title: string
  sessionName: string
  workoutType: WorkoutType
  segments: Segment[]
  glossary: GlossaryEntry[]
  lastLogs: Record<string, ExerciseLog>
  restored?: RestoredTimer
  onPersist: (state: RestoredTimer) => void
  onExit: () => void
  onDone: () => void
  onEndEarly: () => void
}

/** Share of the workout done, weighted by time. Rep sets with no clock count as 30s. */
function overallProgress(segments: Segment[], index: number, progress: number): number {
  const weight = (segment: Segment) => (segment.durationSec > 0 ? segment.durationSec : 30)
  const total = segments.reduce((sum, segment) => sum + weight(segment), 0)
  if (total === 0) return 0
  const before = segments.slice(0, index).reduce((sum, segment) => sum + weight(segment), 0)
  const current = segments[index] ? weight(segments[index]) * progress : 0
  return Math.min(1, (before + current) / total)
}

const phaseLabel: Record<Segment['kind'], string> = {
  warmup: 'Warm-up',
  prepare: 'Get ready',
  work: 'Work',
  rest: 'Rest',
}

export function SessionScreen({
  title,
  sessionName,
  workoutType,
  segments,
  glossary,
  lastLogs,
  restored,
  onPersist,
  onExit,
  onDone,
  onEndEarly,
}: Props) {
  const session = useSession(segments, restored)
  const [sheet, setSheet] = useState<GlossaryEntry[] | null>(null)
  const [ending, setEnding] = useState(false)
  const pausedByForm = useRef(false)
  const pausedByEnd = useRef(false)
  // Set when leaving on purpose, so the unmount flush doesn't re-save a workout the app just cleared.
  const leaving = useRef(false)
  const persistRef = useRef(onPersist)
  const snapshotRef = useRef({
    index: session.index,
    remainingMs: session.remainingMs,
    status: session.status,
    emomResting: session.emomResting,
  })
  persistRef.current = onPersist
  snapshotRef.current = {
    index: session.index,
    remainingMs: session.remainingMs,
    status: session.status,
    emomResting: session.emomResting,
  }

  useEffect(() => {
    const flush = () => {
      const snap = snapshotRef.current
      if (leaving.current || snap.status === 'idle') return
      persistRef.current({
        index: snap.index,
        remainingMs: snap.remainingMs,
        status: snap.status,
        emomResting: snap.emomResting,
      })
    }
    flush()
    const id = window.setInterval(flush, 1000)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      flush()
      window.clearInterval(id)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [])

  useEffect(() => {
    const snap = snapshotRef.current
    if (snap.status === 'idle') return
    persistRef.current({
      index: snap.index,
      remainingMs: snap.remainingMs,
      status: snap.status,
      emomResting: snap.emomResting,
    })
  }, [session.status, session.index, session.emomResting])

  useEffect(() => {
    if (session.status === 'done') onDone()
  }, [session.status, onDone])

  useEffect(() => {
    if (session.status !== 'running') return
    let lock: WakeLockSentinel | undefined
    const request = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen')
      } catch {
        // Wake lock is best-effort on unsupported browsers.
      }
    }
    void request()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [session.status])

  useEffect(() => {
    if (!restored) session.start()
    // Auto-start a fresh session only. Restored workouts keep their place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const entries = useMemo(() => {
    if (!session.segment?.glossaryName) return []
    return matchGlossaryEntries(session.segment.glossaryName, glossary)
  }, [glossary, session.segment?.glossaryName])

  const openForm = () => {
    if (entries.length === 0) return
    if (session.status === 'running') {
      session.pause()
      pausedByForm.current = true
    }
    setSheet(entries)
  }

  const closeForm = () => {
    setSheet(null)
    if (!pausedByForm.current) return
    pausedByForm.current = false
    session.resume()
  }

  const askEndEarly = () => {
    if (session.status === 'running') {
      session.pause()
      pausedByEnd.current = true
    }
    setEnding(true)
  }

  const cancelEndEarly = () => {
    setEnding(false)
    if (!pausedByEnd.current) return
    pausedByEnd.current = false
    session.resume()
  }

  const confirmEndEarly = () => {
    pausedByEnd.current = false
    leaving.current = true
    setEnding(false)
    onEndEarly()
  }

  const exit = () => {
    leaving.current = true
    onExit()
  }

  const segment = session.segment
  if (!segment) return null

  const remaining = formatClock(session.remainingMs / 1000)
  const overall = overallProgress(segments, session.index, session.progress)
  const awaiting = Boolean(segment.awaitComplete)
  const emomResting = workoutType === 'emom' && session.emomResting
  const kind = emomResting ? 'rest' : segment.kind
  const hideWorkClock =
    kind === 'work' && (awaiting || Boolean(segment.hideWorkClock))
  const dialTitle = emomResting ? 'Breathe' : segment.title
  // A bare rep range ("8–15") is the number to show; the top of the range alone reads as an order.
  const repRange =
    segment.target && /^\d+\s*[–-]\s*\d+$/.test(segment.target.trim())
      ? segment.target.trim()
      : undefined
  const dialDetail = emomResting
    ? undefined
    : hideWorkClock
      ? [repRange ? 'reps' : (segment.target ?? (segment.reps ? 'reps' : undefined)), segment.bell]
          .filter(Boolean)
          .join(' · ') || undefined
      : [segment.target, segment.bell].filter(Boolean).join(' · ') || undefined
  const showComplete =
    (workoutType === 'emom' && segment.kind === 'work' && !emomResting) ||
    (awaiting && kind === 'work')
  const ringProgress = hideWorkClock ? 0 : session.progress
  const roundText =
    segment.round && segment.totalRounds
      ? `${segment.roundKind === 'set' ? 'Set' : 'Round'} ${segment.round}/${segment.totalRounds}`
      : undefined
  const phaseText =
    kind === 'work' && workoutType === 'emom'
      ? 'EMOM'
      : kind === 'work'
        ? undefined
        : phaseLabel[kind]
  const showRound = Boolean(roundText && phaseText)
  const lastLog =
    (kind === 'work' || segment.kind === 'prepare') && !emomResting
      ? lastLogs[logKey(segment.title)]
      : undefined
  const lastLine = lastLog ? formatLog(lastLog) : undefined

  const finishWork = () => {
    session.complete()
  }

  return (
    <main
      className={`session session-${kind}${workoutType === 'emom' ? ' is-emom' : ''}`}
    >
      <header className="session-top">
        <button className="ghost" type="button" onClick={exit}>
          Exit
        </button>
        <div className="session-kicker">
          <span>{title}</span>
          <strong>{sessionName}</strong>
        </div>
        <button
          className="ghost"
          type="button"
          onClick={openForm}
          disabled={entries.length === 0}
        >
          Form
        </button>
      </header>

      <p className="phase">{phaseText ?? roundText}</p>
      {showRound ? <p className="session-round">{roundText}</p> : null}

      <div
        className="dial"
        style={{ ['--progress' as string]: `${Math.round((1 - ringProgress) * 100)}%` }}
      >
        <div className="dial-face">
          <p className="clock">
            {hideWorkClock
              ? (repRange ?? (segment.reps ? `${segment.reps}` : '—'))
              : remaining}
          </p>
          <h1>{dialTitle}</h1>
          {dialDetail ? <p className="bell">{dialDetail}</p> : null}
        </div>
      </div>

      {lastLine ? <p className="last-log">Last time: {lastLine}</p> : null}
      {segment.subtitle && segment.subtitle !== roundText ? (
        <p className="meta">{segment.subtitle}</p>
      ) : null}
      {segment.kind !== 'prepare' && segment.nextTitle ? (
        <p className="next">
          {segment.kind === 'warmup' ? 'First lift' : 'Next'}: {segment.nextTitle}
        </p>
      ) : null}
      {segment.kind !== 'work' &&
      entries.some((entry) => entry.notes.length > 0) ? (
        <p className="hint">
          {entries.flatMap((entry) => entry.notes).join(' · ')}
        </p>
      ) : null}

      <div className="overall">
        <span style={{ width: `${Math.round(overall * 100)}%` }} />
      </div>

      <div className="session-actions">
        {showComplete ? (
          <button className="complete-btn" type="button" onClick={finishWork}>
            Complete
          </button>
        ) : null}

        <div className={showComplete && awaiting ? 'controls is-single' : 'controls'}>
          {showComplete && awaiting ? null : session.status === 'running' ? (
            <button className="primary" type="button" onClick={session.pause}>
              Pause
            </button>
          ) : (
            <button className="primary" type="button" onClick={session.resume}>
              Resume
            </button>
          )}
          <button className="secondary" type="button" onClick={session.skip}>
            Skip
          </button>
        </div>
        <button className="end-workout" type="button" onClick={askEndEarly}>
          End workout
        </button>
      </div>

      <EndWorkoutDialog
        open={ending}
        onEnd={confirmEndEarly}
        onCancel={cancelEndEarly}
      />

      {sheet ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Form cues">
          <div className="sheet-card">
            <div className="sheet-handle" />
            {sheet.map((entry) => (
              <section key={entry.name} className="form-entry">
                <h2>{entry.name}</h2>
                <ol>
                  {entry.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {entry.notes.length > 0 ? (
                  <ul>
                    {entry.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
            <button className="primary" type="button" onClick={closeForm}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </main>
  )
}

function EndWorkoutDialog({
  open,
  onEnd,
  onCancel,
}: {
  open: boolean
  onEnd: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby="end-workout-title"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <h2 id="end-workout-title">End workout</h2>
      <p>Are you sure you want to end early? This session will not count as completed.</p>
      <button className="primary" type="button" onClick={onEnd}>
        End
      </button>
      <button className="secondary" type="button" onClick={onCancel}>
        Cancel
      </button>
    </dialog>
  )
}

const doneLines = [
  'Rack the bell. That was the work.',
  'Set it down. Session’s done.',
  'Done. Walk it off.',
  'The hard part’s over.',
  'Breathe. Then go on with your day.',
  'That’s the work for today.',
  'Park the bell. Let your heart come down.',
  'Leave the work on the mat.',
  'Unclench. You’re done.',
  'Bell down. Work done.',
  'That’s it. Recover.',
  'Good. Now cool down.',
  'Work’s done. Let it settle.',
  'Set the bell down. You’re finished.',
]

type Draft = { name: string; bell?: string; reps?: number; timed: boolean; hint?: string; range?: string }

function draftsFor(
  session: Session | undefined,
  program: Program,
  lastLogs: Record<string, ExerciseLog>,
): Draft[] {
  if (!session) return []
  const bells = ownedBells(program)
  const seen = new Set<string>()
  const drafts: Draft[] = []
  for (const exercise of session.exercises) {
    const key = logKey(exercise.name)
    if (seen.has(key)) continue
    seen.add(key)
    const last = lastLogs[key]
    const range = repRange(exercise)
    const bell = defaultBell(exercise, last, bells)
    drafts.push({
      name: exercise.name,
      bell,
      // Same bell as last time: start from last time's reps. New bell: start blank.
      reps: isTimed(exercise) || bell !== last?.bell ? undefined : last?.reps,
      timed: isTimed(exercise),
      hint: progressionHint(exercise, last, bells),
      range: range ? (range.low === range.high ? `${range.high}` : `${range.low}–${range.high}`) : undefined,
    })
  }
  return drafts
}

export function DoneScreen({
  sessionName,
  programTitle,
  program,
  session,
  lastLogs,
  onSave,
  onHome,
}: {
  sessionName: string
  programTitle: string
  program: Program
  session?: Session
  lastLogs: Record<string, ExerciseLog>
  onSave: (entries: LogEntry[]) => Promise<void>
  onHome: () => void
}) {
  const [line] = useState(
    () => doneLines[Math.floor(Math.random() * doneLines.length)],
  )
  const [drafts, setDrafts] = useState(() => draftsFor(session, program, lastLogs))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bells = ownedBells(program)

  const update = (index: number, patch: Partial<Draft>) =>
    setDrafts((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(
        drafts.map((draft) => ({ exerciseName: draft.name, bell: draft.bell, reps: draft.reps })),
      )
      onHome()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
      setSaving(false)
    }
  }

  return (
    <main className="done">
      <p className="phase">Session complete</p>
      <h1>{sessionName}</h1>
      <p className="lede">{line}</p>

      {drafts.length > 0 ? (
        <section className="log">
          <h2>What did you lift?</h2>
          <ol>
            {drafts.map((draft, index) => (
              <li key={draft.name}>
                <strong>{draft.name}</strong>
                {draft.hint ? <p className="log-hint">{draft.hint}</p> : null}
                {bells.length > 0 ? (
                  <div className="bell-chips" role="radiogroup" aria-label={`${draft.name} bell`}>
                    {bells.map((kg) => {
                      const label = bellLabel(kg)
                      const on = draft.bell === label
                      return (
                        <button
                          key={kg}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          className={on ? 'is-on' : undefined}
                          onClick={() => update(index, { bell: on ? undefined : label })}
                        >
                          {kg}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                {draft.timed ? null : (
                  <div className="reps-stepper">
                    <button
                      type="button"
                      aria-label="Fewer reps"
                      onClick={() =>
                        update(index, { reps: Math.max(0, (draft.reps ?? 0) - 1) })
                      }
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder={draft.range ?? 'reps'}
                      aria-label={`${draft.name} reps`}
                      value={draft.reps ?? ''}
                      onChange={(event) => {
                        const value = event.target.value
                        update(index, { reps: value === '' ? undefined : Math.max(0, Number(value)) })
                      }}
                    />
                    <button
                      type="button"
                      aria-label="More reps"
                      onClick={() => update(index, { reps: (draft.reps ?? 0) + 1 })}
                    >
                      +
                    </button>
                    <span className="reps-label">
                      reps{draft.range ? ` (aim ${draft.range})` : ''}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <p className="log-note">Log your last set: the hardest one.</p>
          {error ? <p className="log-error">{error}</p> : null}
          <button className="primary" type="button" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="ghost skip-log" type="button" onClick={onHome}>
            Skip
          </button>
        </section>
      ) : (
        <button className="primary" type="button" onClick={onHome}>
          Back to {programTitle}
        </button>
      )}
    </main>
  )
}
