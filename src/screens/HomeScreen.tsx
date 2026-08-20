import { useEffect, useRef, useState } from 'react'
import {
  canPlayEmom,
  effectiveType,
  estimateSessionSeconds,
  exerciseLine,
  formatMinutes,
  workoutTypeLabel,
} from '../timeline.ts'
import { displayTitle } from '../loadWorkouts.ts'
import {
  canAdvanceMonth,
  currentWeek,
  isStarted,
  leftoverLine,
  monthLabel,
  programEyebrow,
} from '../programs.ts'
import type {
  Program,
  ProgramPhase,
  ProgramProgress,
  ScheduleRow,
  Session,
  SessionMode,
} from '../types.ts'

type Props = {
  program: Program
  progress: ProgramProgress
  includeWarmup: boolean
  mode: SessionMode
  doneSessionIds: string[]
  canEdit?: boolean
  onToggleWarmup: () => void
  onModeChange: (mode: SessionMode) => void
  onBack: () => void
  onStart: (session: Session) => void
  onStartProgram: () => void
  onEndProgram: () => void
  onProceed?: () => void
  onEdit?: () => void
}

function viewForPhase(program: Program, phase: ProgramPhase): Program {
  return {
    ...program,
    stage: phase.name,
    focus: phase.focus,
    schedule: phase.schedule,
    sessions: phase.sessions,
  }
}

type WeekStatus = 'done' | 'today' | 'upcoming' | 'available'

type WeekRow = {
  day: string
  workout?: string
  rest: boolean
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
const weekday = WEEKDAYS[new Date().getDay()]

function todaysRow(program: Program) {
  return program.schedule.find((row) => row.day.toLowerCase() === weekday.toLowerCase())
}

function formatEquipment(item: string): string {
  return item.replace(/^1\s*[×x]\s*/i, '').trim()
}

function warmupToggleLabel(totalSec: number): string {
  const minutes = Math.max(1, Math.round(totalSec / 60))
  return `Include ${minutes} min warm-up`
}

function weekOrder(dayName: string): number {
  const index = WEEKDAYS.findIndex((day) => day.toLowerCase() === dayName.toLowerCase())
  if (index < 0) return 99
  return index === 0 ? 6 : index - 1
}

function sessionForRow(program: Program, row: ScheduleRow) {
  return program.sessions.find((session) => session.name === row.workout)
}

function weekRows(program: Program): WeekRow[] {
  const scheduled = new Map(
    program.schedule.map((row) => [row.day.toLowerCase(), row]),
  )
  const days = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ]
  for (const row of program.schedule) {
    if (!days.some((day) => day.toLowerCase() === row.day.toLowerCase())) {
      days.push(row.day)
    }
  }
  days.sort((a, b) => weekOrder(a) - weekOrder(b))
  return days.map((day) => {
    const row = scheduled.get(day.toLowerCase())
    return row
      ? { day: row.day, workout: row.workout, rest: false }
      : { day, rest: true }
  })
}

function rowStatus(row: WeekRow, done: boolean): WeekStatus | undefined {
  const isToday = row.day.toLowerCase() === weekday.toLowerCase()
  if (row.rest) return isToday ? 'today' : undefined
  if (done) return 'done'
  if (isToday) return 'today'
  if (weekOrder(row.day) < weekOrder(weekday)) return 'available'
  return 'upcoming'
}

function statusLabel(status: WeekStatus): string {
  if (status === 'done') return 'Done'
  if (status === 'today') return 'Today'
  if (status === 'available') return 'Available'
  return 'Upcoming'
}

function shortDay(day: string): string {
  return day.slice(0, 3)
}

function shortWorkout(name: string): string {
  return name.replace(/^workout\s+/i, '').trim() || name
}

function SessionCard({
  session,
  program,
  includeWarmup,
  mode,
  featured,
  done,
  canStart,
  onStart,
}: {
  session: Session
  program: Program
  includeWarmup: boolean
  mode: SessionMode
  featured: boolean
  done: boolean
  canStart: boolean
  onStart: (session: Session) => void
}) {
  const seconds = estimateSessionSeconds(
    session,
    program.warmup?.totalSec,
    includeWarmup,
    mode,
  )
  const type = effectiveType(session, mode)
  return (
    <article className={featured ? 'session-card is-current' : 'session-card'}>
      <header>
        <div>
          <h2>{session.name}</h2>
          <p className="session-meta">
            {workoutTypeLabel(type)} · {session.rounds} rounds ·{' '}
            {session.exercises.length} moves · {formatMinutes(seconds)}
          </p>
        </div>
        {done ? <span className="badge">Completed</span> : null}
      </header>
      <ol>
        {session.exercises.map((exercise) => (
          <li key={exercise.name}>
            <strong>{exercise.name}</strong>
            <span>{exerciseLine(session, exercise, mode)}</span>
          </li>
        ))}
      </ol>
      {canStart ? (
        <button
          className={featured ? 'primary' : 'secondary'}
          type="button"
          onClick={() => onStart(session)}
        >
          {done ? 'Start again' : `Start ${session.name}`}
        </button>
      ) : null}
    </article>
  )
}

function EndProgramDialog({
  open,
  leftover,
  onEnd,
  onCancel,
}: {
  open: boolean
  leftover: string
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
      aria-labelledby="end-program-title"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <h2 id="end-program-title">End program</h2>
      <p>{leftover}</p>
      <button className="primary" type="button" onClick={onEnd}>
        End
      </button>
      <button className="secondary" type="button" onClick={onCancel}>
        Cancel
      </button>
    </dialog>
  )
}

export function ProgramScreen({
  program,
  progress,
  includeWarmup,
  mode,
  doneSessionIds,
  canEdit,
  onToggleWarmup,
  onModeChange,
  onBack,
  onStart,
  onStartProgram,
  onEndProgram,
  onProceed,
  onEdit,
}: Props) {
  const [ending, setEnding] = useState(false)
  const phases = program.phases ?? []
  const started = isStarted(progress)
  const month = phases.some((phase) => phase.month === progress.currentMonth)
    ? progress.currentMonth
    : (phases[0]?.month ?? 1)
  const phase = phases.find((item) => item.month === month) ?? phases[0]
  const view = phase ? viewForPhase(program, phase) : program
  const doneIds = new Set(doneSessionIds)
  const todayRow = todaysRow(view)
  const featured =
    started && todayRow ? sessionForRow(view, todayRow) : undefined
  const others = featured
    ? view.sessions.filter((session) => session.id !== featured.id)
    : view.sessions
  const owner =
    program.ownerName && !program.isBuiltin ? `By ${program.ownerName}.` : ''
  const multiMonth = phases.length > 1
  const week = phase && started ? currentWeek(phase, progress.completions) : 0
  const readyToProceed =
    started && canAdvanceMonth(program, { ...progress, currentMonth: month })
  const nextMonth = program.phases.find((item) => item.month === month + 1)
  const statusLine = started
    ? [
        multiMonth ? monthLabel(program, month) : undefined,
        multiMonth ? `Week ${week}` : undefined,
        !multiMonth && view.schedule.length ? `${view.schedule.length} days a week` : undefined,
        owner,
      ]
        .filter(Boolean)
        .join(' · ')
    : owner

  const showEmomChoice = view.sessions.some(canPlayEmom)
  const controls = (
    <>
      {program.warmup ? (
        <label className="toggle">
          <input
            type="checkbox"
            checked={includeWarmup}
            onChange={onToggleWarmup}
          />
          <span className="switch" aria-hidden="true" />
          {warmupToggleLabel(program.warmup.totalSec)}
        </label>
      ) : null}
      {showEmomChoice ? (
        <div className="mode-switch" role="radiogroup" aria-label="Workout timing">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'regular'}
            className={mode === 'regular' ? 'is-on' : undefined}
            onClick={() => onModeChange('regular')}
          >
            Regular
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'emom'}
            className={mode === 'emom' ? 'is-on' : undefined}
            onClick={() => onModeChange('emom')}
          >
            EMOM
          </button>
        </div>
      ) : null}
    </>
  )

  return (
    <main className="page program">
      <button className="back" type="button" onClick={onBack}>
        All programs
      </button>
      {canEdit && onEdit ? (
        <button className="ghost" type="button" onClick={onEdit}>
          Edit program
        </button>
      ) : null}
      {programEyebrow(program) ? (
        <p className="eyebrow">{programEyebrow(program)}</p>
      ) : null}
      <h1>{displayTitle(program)}</h1>
      {multiMonth && phase?.name ? <p className="phase-name">{phase.name}</p> : null}
      {statusLine ? <p className="program-status">{statusLine}</p> : null}
      {program.equipment.length > 0 ? (
        <p className="equipment-line">
          Equipment: {program.equipment.map(formatEquipment).join(' · ')}
        </p>
      ) : null}

      {started && readyToProceed && nextMonth && onProceed ? (
        <button className="primary proceed" type="button" onClick={onProceed}>
          Proceed to month {nextMonth.month}
        </button>
      ) : null}

      {!started ? (
        <button className="primary start-program" type="button" onClick={onStartProgram}>
          Start program
        </button>
      ) : null}

      {started && view.schedule.length > 0 ? (
        <section className="week">
          <h2>This week</h2>
          <ol className="week-strip">
            {weekRows(view).map((row) => {
              const session = row.workout
                ? view.sessions.find((item) => item.name === row.workout)
                : undefined
              const dayStatus = started
                ? rowStatus(row, Boolean(session && doneIds.has(session.id)))
                : undefined
              const isToday = row.day.toLowerCase() === weekday.toLowerCase()
              const label = [
                row.day,
                row.rest ? 'Rest' : row.workout,
                dayStatus ? statusLabel(dayStatus) : undefined,
              ]
                .filter(Boolean)
                .join(', ')
              return (
                <li
                  key={row.day}
                  aria-label={label}
                  className={[
                    isToday ? 'today' : undefined,
                    dayStatus === 'done' ? 'is-done' : undefined,
                    row.rest ? 'is-rest' : undefined,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="week-day">
                    {isToday ? row.day : shortDay(row.day)}
                  </span>
                  <strong className="week-work">
                    {row.rest
                      ? 'Rest'
                      : isToday
                        ? (row.workout ?? '')
                        : shortWorkout(row.workout ?? '')}
                  </strong>
                  <span className={dayStatus ? `status is-${dayStatus}` : 'status'}>
                    {dayStatus ? statusLabel(dayStatus) : ''}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      ) : null}

      {started ? controls : null}

      {featured ? (
        <section className="sessions">
          <SessionCard
            key={featured.id}
            session={featured}
            program={view}
            includeWarmup={includeWarmup}
            mode={mode}
            featured
            done={doneIds.has(featured.id)}
            canStart={started}
            onStart={onStart}
          />
        </section>
      ) : null}

      <section className="sessions">
        {featured && others.length > 0 ? (
          <h2 className="sessions-other">Other workouts</h2>
        ) : null}
        {others.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            program={view}
            includeWarmup={includeWarmup}
            mode={mode}
            featured={false}
            done={doneIds.has(session.id)}
            canStart={started}
            onStart={onStart}
          />
        ))}
      </section>

      {started ? (
        <button className="end-workout" type="button" onClick={() => setEnding(true)}>
          End program
        </button>
      ) : null}

      <EndProgramDialog
        open={ending}
        leftover={leftoverLine(program, { ...progress, currentMonth: month })}
        onEnd={() => {
          setEnding(false)
          onEndProgram()
        }}
        onCancel={() => setEnding(false)}
      />
    </main>
  )
}

export function HomeScreen({
  beginner,
  mine,
  others,
  currentProgram,
  currentProgress,
  onOpen,
  onOpenGlossary,
  onNewWorkout,
  onNewProgram,
  onSignOut,
}: {
  beginner: Program[]
  mine: Program[]
  others: Program[]
  currentProgram?: Program
  currentProgress?: ProgramProgress
  onOpen: (id: string) => void
  onOpenGlossary: () => void
  onNewWorkout: () => void
  onNewProgram: () => void
  onSignOut: () => void
}) {
  const otherBeginner = beginner.filter((program) => program.id !== currentProgram?.id)
  const otherMine = mine.filter((program) => program.id !== currentProgram?.id)
  const started = currentProgress ? isStarted(currentProgress) : false
  const currentMonth = currentProgress?.currentMonth ?? 1
  const currentPhase =
    currentProgram?.phases.find((phase) => phase.month === currentMonth) ??
    currentProgram?.phases[0]
  const week =
    started && currentPhase && currentProgress
      ? currentWeek(currentPhase, currentProgress.completions)
      : undefined
  const currentMeta =
    started && currentProgram
      ? [
          monthLabel(currentProgram, currentMonth),
          week ? `Week ${week}` : undefined,
        ]
          .filter(Boolean)
          .join(' · ')
      : ''

  const card = (program: Program) => {
    return (
      <li key={program.id}>
        <button type="button" onClick={() => onOpen(program.id)}>
          {programEyebrow(program) ? (
            <span className="eyebrow">{programEyebrow(program)}</span>
          ) : null}
          <strong>{displayTitle(program)}</strong>
          {program.focus ? <span className="card-focus">{program.focus}</span> : null}
          {program.ownerName && !program.isBuiltin ? (
            <span className="card-focus">By {program.ownerName}</span>
          ) : null}
          <span className="card-action">
            View
            <span className="chevron" aria-hidden="true" />
          </span>
        </button>
      </li>
    )
  }

  return (
    <main className="page home">
      <p className="eyebrow">On the bell</p>
      <h1>Kettlebell</h1>

      {currentProgram ? (
        <section className="current-program">
          <p className="eyebrow">Current program</p>
          <h2>{displayTitle(currentProgram)}</h2>
          {currentPhase?.name ? <p className="phase-name">{currentPhase.name}</p> : null}
          {currentMeta ? <p className="current-meta">{currentMeta}</p> : null}
          <button className="secondary" type="button" onClick={() => onOpen(currentProgram.id)}>
            Open program
          </button>
        </section>
      ) : null}

      {otherBeginner.length > 0 ? (
        <section>
          <h2>Programs</h2>
          <ul className="program-list">{otherBeginner.map(card)}</ul>
        </section>
      ) : null}

      {mine.length > 0 ? (
        <section>
          <h2>Your programs</h2>
          {otherMine.length > 0 ? (
            <ul className="program-list">{otherMine.map(card)}</ul>
          ) : (
            <p className="lede">Your other programs will show up here.</p>
          )}
        </section>
      ) : null}

      {others.length > 0 ? (
        <section>
          <h2>From others</h2>
          <ul className="program-list">{others.map(card)}</ul>
        </section>
      ) : null}

      <section className="create-block">
        <h2>Create</h2>
        <button className="create-card" type="button" onClick={onNewProgram}>
          <span className="eyebrow">Program</span>
          <strong>New program</strong>
          <span className="card-focus">Weekly schedule</span>
          <span className="card-action">
            Create
            <span className="chevron" aria-hidden="true" />
          </span>
        </button>
        <button className="create-card" type="button" onClick={onNewWorkout}>
          <span className="eyebrow">Workout</span>
          <strong>New workout</strong>
          <span className="card-focus">One session</span>
          <span className="card-action">
            Create
            <span className="chevron" aria-hidden="true" />
          </span>
        </button>
      </section>

      <button className="glossary-card" type="button" onClick={onOpenGlossary}>
        <span className="eyebrow">Moves</span>
        <strong>Glossary</strong>
        <span className="card-action">
          View
          <span className="chevron" aria-hidden="true" />
        </span>
      </button>
      <button className="ghost sign-out" type="button" onClick={onSignOut}>
        Sign out
      </button>
    </main>
  )
}
