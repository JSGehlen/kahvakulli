import { estimateSessionSeconds, formatMinutes, sessionMinutes } from '../timeline.ts'
import { displayTitle, levelLabel } from '../loadWorkouts.ts'
import type { Program, ScheduleRow, Session, SessionMode } from '../types.ts'

type Props = {
  program: Program
  previous?: Program
  includeWarmup: boolean
  mode: SessionMode
  doneSessionIds: string[]
  onToggleWarmup: () => void
  onModeChange: (mode: SessionMode) => void
  onBack: () => void
  onStart: (session: Session) => void
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
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  if (!days.some((day) => day.toLowerCase() === weekday.toLowerCase())) {
    days.push(weekday)
  }
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

function nextWorkoutName(program: Program, doneIds: Set<string>): string | undefined {
  return [...program.schedule]
    .sort((a, b) => weekOrder(a.day) - weekOrder(b.day))
    .find((row) => {
      const session = sessionForRow(program, row)
      return Boolean(session && !doneIds.has(session.id))
    })?.workout
}

export function ProgramScreen({
  program,
  previous,
  includeWarmup,
  mode,
  doneSessionIds,
  onToggleWarmup,
  onModeChange,
  onBack,
  onStart,
}: Props) {
  const doneIds = new Set(doneSessionIds)
  const nextName = nextWorkoutName(program, doneIds)

  return (
    <main className="page">
      <button className="back" type="button" onClick={onBack}>
        All programs
      </button>
      <p className="eyebrow">
        {[program.duration, program.difficulty].filter(Boolean).join(' · ') || 'Program'}
      </p>
      <h1>{displayTitle(program)}</h1>
      <p className="lede">
        {program.focus
          ? program.focus
          : previous
            ? `Start after a month of ${levelLabel(previous)}.`
            : 'Start here. Stay for a month, then move up.'}{' '}
        {program.schedule.length} days a week.
      </p>

      {program.equipment.length > 0 ? (
        <ul className="chips">
          {program.equipment.map((item) => (
            <li key={item}>{formatEquipment(item)}</li>
          ))}
        </ul>
      ) : null}

      {program.schedule.length > 0 ? (
        <section>
          <h2>This week</h2>
          <ol className="schedule">
            {weekRows(program).map((row) => {
              const session = row.workout
                ? program.sessions.find((item) => item.name === row.workout)
                : undefined
              const status = rowStatus(
                row,
                Boolean(session && doneIds.has(session.id)),
              )
              return (
                <li
                  key={row.day}
                  className={[
                    status === 'today' ? 'today' : undefined,
                    status === 'done' ? 'is-done' : undefined,
                    row.rest ? 'is-rest' : undefined,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span>{row.day}</span>
                  {row.rest ? (
                    <span className="rest-label">Rest</span>
                  ) : (
                    <strong>{row.workout}</strong>
                  )}
                  <span className={status ? `status is-${status}` : 'status'}>
                    {status ? statusLabel(status) : ''}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      ) : null}

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

      <section className="sessions">
        {program.sessions.map((session) => {
          const seconds = estimateSessionSeconds(
            session,
            program.warmup?.totalSec,
            includeWarmup,
            mode,
          )
          const isCurrent = session.name === nextName
          return (
            <article
              key={session.id}
              className={isCurrent ? 'session-card is-current' : 'session-card'}
            >
              <header>
                <div>
                  <h2>{session.name}</h2>
                  <p className="session-meta">
                    {mode === 'emom' ? 'EMOM · ' : ''}
                    {session.rounds} rounds · {session.exercises.length} moves ·{' '}
                    {formatMinutes(seconds)}
                  </p>
                </div>
              </header>
              <ol>
                {session.exercises.map((exercise) => (
                  <li key={exercise.name}>
                    <strong>{exercise.name}</strong>
                    <span>
                      {mode === 'emom'
                        ? [
                            exercise.reps ? `${exercise.reps} reps` : exercise.target,
                            'On the minute',
                            exercise.bell,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : `${exercise.workSec}s work · ${exercise.restSec}s rest${
                            exercise.bell ? ` · ${exercise.bell}` : ''
                          }`}
                    </span>
                  </li>
                ))}
              </ol>
              <button
                className={isCurrent ? 'primary' : 'secondary'}
                type="button"
                onClick={() => onStart(session)}
              >
                Start {session.name}
              </button>
            </article>
          )
        })}
      </section>
    </main>
  )
}

export function HomeScreen({
  programs,
  currentProgram,
  doneSessionIds,
  mode,
  onOpen,
  onStartToday,
}: {
  programs: Program[]
  currentProgram?: Program
  doneSessionIds: string[]
  mode: SessionMode
  onOpen: (id: string) => void
  onStartToday: (session: Session) => void
}) {
  const today = currentProgram ? todaysRow(currentProgram) : undefined
  const todaySession = today
    ? currentProgram?.sessions.find((session) => session.name === today.workout)
    : undefined
  const todayDone = Boolean(todaySession && doneSessionIds.includes(todaySession.id))
  const todayMinutes =
    currentProgram && todaySession
      ? formatMinutes(
          estimateSessionSeconds(todaySession, currentProgram.warmup?.totalSec, true, mode),
        )
      : undefined
  const minutes = programs.flatMap((program) =>
    program.sessions.map((session) => sessionMinutes(program, session, true)),
  )
  const minMinutes = minutes.length ? Math.min(...minutes) : undefined
  const maxMinutes = minutes.length ? Math.max(...minutes) : undefined
  const daysAWeek = programs[0]?.schedule.length
  const summary = [
    programs.length === 1 ? '1 month' : `${programs.length} months`,
    daysAWeek ? `${daysAWeek} days/week` : undefined,
    minMinutes && maxMinutes
      ? minMinutes === maxMinutes
        ? `~${minMinutes} min`
        : `${minMinutes}–${maxMinutes} min`
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <main className="page home">
      <p className="eyebrow">On the bell</p>
      <h1>Kettlebell</h1>
      <p className="lede">
        Build strength, conditioning, and confidence—one level at a time.
      </p>

      {todaySession && !todayDone ? (
        <button
          className="primary home-start"
          type="button"
          onClick={() => onStartToday(todaySession)}
        >
          Start {todaySession.name}
          {todayMinutes ? ` · ${todayMinutes}` : ''}
        </button>
      ) : null}

      {programs.length === 0 ? (
        <section className="empty">
          <h2>No workouts yet</h2>
          <p>
            Add a markdown file to the <code>workouts/</code> folder. Each file
            becomes a program in this list.
          </p>
        </section>
      ) : (
        <>
          <ul className="program-list">
            {programs.map((program) => {
              const current = program.id === currentProgram?.id
              return (
                <li key={program.id}>
                  <button
                    className={current ? 'is-current' : undefined}
                    type="button"
                    onClick={() => onOpen(program.id)}
                  >
                    <span className="eyebrow">
                      {[program.duration, program.difficulty].filter(Boolean).join(' · ') ||
                        'Program'}
                      {current ? ' · Current' : ''}
                    </span>
                    <strong>{displayTitle(program)}</strong>
                    {program.focus ? (
                      <span className="card-focus">{program.focus}</span>
                    ) : null}
                    <span className="card-action">
                      View
                      <span className="chevron" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {summary ? <p className="program-meta">{summary}</p> : null}
        </>
      )}
    </main>
  )
}
