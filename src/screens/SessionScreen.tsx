import { useEffect, useMemo, useRef, useState } from 'react'
import { matchGlossaryEntries } from '../parseWorkout.ts'
import type { RestoredTimer } from '../persist.ts'
import { formatClock } from '../timeline.ts'
import type { GlossaryEntry, Segment, SessionMode } from '../types.ts'
import { useSession } from '../useSession.ts'

type Props = {
  title: string
  sessionName: string
  mode: SessionMode
  segments: Segment[]
  glossary: GlossaryEntry[]
  restored?: RestoredTimer
  onPersist: (state: RestoredTimer) => void
  onExit: () => void
  onDone: () => void
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
  mode,
  segments,
  glossary,
  restored,
  onPersist,
  onExit,
  onDone,
}: Props) {
  const session = useSession(segments, restored)
  const [minuteComplete, setMinuteComplete] = useState(false)
  const [sheet, setSheet] = useState<GlossaryEntry[] | null>(null)

  useEffect(() => {
    setMinuteComplete(false)
  }, [session.index])
  const pausedByForm = useRef(false)
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
      if (snap.status === 'idle') return
      persistRef.current({
        index: snap.index,
        remainingMs: snap.remainingMs,
        status: snap.status,
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

  const segment = session.segment
  if (!segment) return null

  const remaining = formatClock(session.remainingMs / 1000)
  const overall = segments.length === 0 ? 0 : (session.index + session.progress) / segments.length
  const emomResting = mode === 'emom' && (session.emomResting || minuteComplete)
  const kind = emomResting ? 'rest' : segment.kind
  const prescription = segment.reps
    ? `${segment.reps} reps`
    : segment.target
  const dialTitle = emomResting ? 'Breathe' : segment.title
  const dialDetail = emomResting
    ? undefined
    : [prescription, segment.bell].filter(Boolean).join(' · ') || undefined
  const showComplete = mode === 'emom' && segment.kind === 'work' && !emomResting

  const finishMinute = () => {
    setMinuteComplete(true)
    session.complete()
  }

  return (
    <main
      className={`session session-${kind}${mode === 'emom' ? ' is-emom' : ''}`}
    >
      <header className="session-top">
        <button className="ghost" type="button" onClick={onExit}>
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

      <p className="phase">
        {kind === 'work' && mode === 'emom'
          ? 'EMOM'
          : phaseLabel[kind]}
      </p>

      <div
        className="dial"
        style={{ ['--progress' as string]: `${Math.round((1 - session.progress) * 100)}%` }}
      >
        <div className="dial-face">
          <p className="clock">{remaining}</p>
          <h1>{dialTitle}</h1>
          {dialDetail ? <p className="bell">{dialDetail}</p> : null}
        </div>
      </div>

      <p className="meta">{segment.subtitle}</p>
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
          <button className="complete-btn" type="button" onClick={finishMinute}>
            Complete
          </button>
        ) : null}

        <div className="controls">
          {session.status === 'running' ? (
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
        <button className="end-workout" type="button" onClick={onDone}>
          End workout
        </button>
      </div>

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

export function DoneScreen({
  sessionName,
  programTitle,
  onHome,
}: {
  sessionName: string
  programTitle: string
  onHome: () => void
}) {
  const [line] = useState(
    () => doneLines[Math.floor(Math.random() * doneLines.length)],
  )

  return (
    <main className="done">
      <p className="phase">Session complete</p>
      <h1>{sessionName}</h1>
      <p className="lede">{line}</p>
      <button className="primary" type="button" onClick={onHome}>
        Back to {programTitle}
      </button>
    </main>
  )
}

