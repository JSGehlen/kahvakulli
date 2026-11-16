import { useEffect, useRef, useState } from 'react'
import {
  effectiveType,
  estimateSessionSeconds,
  exerciseLine,
  formatMinutes,
  isStraightSets,
  playableTypes,
  workoutTypeLabel,
} from '../timeline.ts'
import { displayTitle } from '../loadWorkouts.ts'
import {
  MONTH_WEEKS,
  abCycleWeek,
  canAdvanceMonth,
  currentPhase,
  currentWeek,
  daysSinceActive,
  isMultiMonth,
  isStarted,
  leftoverLine,
  monthLabel,
  needsResumeChoice,
  orderedSchedule,
  programEyebrow,
  scheduleForAbCycle,
  usesAbAlternation,
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
  canEdit?: boolean
  onToggleWarmup: () => void
  onModeChange: (mode: SessionMode) => void
  onBack: () => void
  onStart: (session: Session) => void
  onStartProgram: () => void
  onEndProgram: () => void
  onProceed?: () => void
  onResume?: (week: number, clearWeek: boolean) => void
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

/** The program as you see it now: current month, with A/B swapped on even weeks. */
export function programView(program: Program, progress: ProgramProgress): Program {
  const phase = currentPhase(program, progress)
  const base = phase ? viewForPhase(program, phase) : program
  const cycleWeek =
    isStarted(progress) && usesAbAlternation(base.schedule) ? abCycleWeek(progress) : 1
  return { ...base, schedule: scheduleForAbCycle(base.schedule, cycleWeek) }
}

type Slot = {
  label: string
  session?: Session
  done: boolean
}

/**
 * The week's sessions in order. A slot is done when you've finished its
 * workout this training week; sessions done out of order fill the earliest gap.
 */
export function weekSlots(view: Program, weekDoneIds: string[]): Slot[] {
  const rows: ScheduleRow[] = view.schedule.length
    ? orderedSchedule(view.schedule)
    : view.sessions.map((session) => ({ day: '', workout: session.name }))
  const slots: Slot[] = rows.map((row) => ({
    label: row.workout,
    session: view.sessions.find((session) => session.name === row.workout),
    done: false,
  }))
  const leftover: string[] = []
  for (const id of weekDoneIds) {
    const match = slots.find((slot) => !slot.done && slot.session?.id === id)
    if (match) match.done = true
    else leftover.push(id)
  }
  for (let count = 0; count < leftover.length; count += 1) {
    const gap = slots.find((slot) => !slot.done)
    if (gap) gap.done = true
  }
  return slots
}

export function nextSession(view: Program, progress: ProgramProgress): Session | undefined {
  const slots = weekSlots(view, progress.weekDoneIds)
  return slots.find((slot) => !slot.done)?.session ?? slots[0]?.session ?? view.sessions[0]
}

function formatEquipment(item: string): string {
  return item.replace(/^1\s*[×x]\s*/i, '').trim()
}

function warmupToggleLabel(totalSec: number): string {
  const minutes = Math.max(1, Math.round(totalSec / 60))
  return `Include ${minutes} min warm-up`
}

function shortWorkout(name: string): string {
  const stripped = name.replace(/^workout\s+/i, '').trim() || name
  return stripped.split(/\s+[—–-]\s+/)[0] ?? stripped
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
  const meta = isStraightSets(session)
    ? `${session.exercises.length} lifts · ${formatMinutes(seconds)}`
    : `${workoutTypeLabel(type)} · ${session.rounds} rounds · ${session.exercises.length} moves · ${formatMinutes(seconds)}`
  return (
    <article className={featured ? 'session-card is-current' : 'session-card'}>
      <header>
        <div>
          {featured ? <p className="eyebrow">Next up</p> : null}
          <h2>{session.name}</h2>
          <p className="session-meta">{meta}</p>
        </div>
        {done ? <span className="badge">Done this week</span> : null}
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
          {done ? 'Do again' : `Start ${session.name}`}
        </button>
      ) : null}
    </article>
  )
}

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
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
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <h2>{title}</h2>
      <p>{body}</p>
      <button className="primary" type="button" onClick={onConfirm}>
        {confirmLabel}
      </button>
      <button className="secondary" type="button" onClick={onCancel}>
        Cancel
      </button>
    </dialog>
  )
}

function ResumeCard({
  days,
  week,
  doneThisWeek,
  onResume,
}: {
  days: number
  week: number
  doneThisWeek: number
  onResume: (week: number, clearWeek: boolean) => void
}) {
  const options: { label: string; week: number; clear: boolean; primary: boolean }[] = [
    {
      label: doneThisWeek > 0 ? `Continue week ${week}` : `Start week ${week}`,
      week,
      clear: false,
      primary: true,
    },
  ]
  if (week > 1) {
    options.push({ label: `Repeat week ${week - 1}`, week: week - 1, clear: true, primary: false })
  } else if (doneThisWeek > 0) {
    options.push({ label: `Restart week ${week}`, week, clear: true, primary: false })
  }
  return (
    <section className="resume-card">
      <p className="eyebrow">Welcome back</p>
      <h2>{days} days since your last session</h2>
      <p className="lede">
        Pick up where you left off, or ease back in by repeating the previous week.
      </p>
      {options.map((option) => (
        <button
          key={option.label}
          className={option.primary ? 'primary' : 'secondary'}
          type="button"
          onClick={() => onResume(option.week, option.clear)}
        >
          {option.label}
        </button>
      ))}
    </section>
  )
}

export function ProgramScreen({
  program,
  progress,
  includeWarmup,
  mode,
  canEdit,
  onToggleWarmup,
  onModeChange,
  onBack,
  onStart,
  onStartProgram,
  onEndProgram,
  onProceed,
  onResume,
  onEdit,
}: Props) {
  const [ending, setEnding] = useState(false)
  const phases = program.phases ?? []
  const started = isStarted(progress)
  const phase = currentPhase(program, progress)
  const month = phase?.month ?? 1
  const view = programView(program, progress)
  const multiMonth = isMultiMonth(program)
  const week = currentWeek(program, progress)
  const slots = weekSlots(view, progress.weekDoneIds)
  const doneCount = slots.filter((slot) => slot.done).length
  const firstOpen = slots.findIndex((slot) => !slot.done)
  const doneIds = new Set(progress.weekDoneIds)
  const readyToProceed = started && canAdvanceMonth(program, progress)
  const programFinished =
    started && multiMonth && !readyToProceed && progress.trainingWeek > MONTH_WEEKS
  const featured = started && !readyToProceed && !programFinished ? nextSession(view, progress) : undefined
  const others = featured
    ? view.sessions.filter((session) => session.id !== featured.id)
    : view.sessions
  const owner =
    program.ownerName && !program.isBuiltin ? `By ${program.ownerName}.` : ''
  const nextMonth = phases.find((item) => item.month === month + 1)
  const days = daysSinceActive(progress)
  const askResume = needsResumeChoice(progress) && days !== undefined
  const statusLine = started
    ? [
        multiMonth ? monthLabel(program, month) : undefined,
        `Week ${week}`,
        `${doneCount}/${slots.length} done`,
        owner,
      ]
        .filter(Boolean)
        .join(' · ')
    : owner

  const typeOptions = playableTypes(view.sessions)
  const showTypeChoice = started && typeOptions.length > 1
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
      {showTypeChoice ? (
        <div
          className={`mode-switch${typeOptions.length > 2 ? ' types' : ''}`}
          role="radiogroup"
          aria-label="Workout timing"
        >
          {typeOptions.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={mode === item}
              className={mode === item ? 'is-on' : undefined}
              onClick={() => onModeChange(item)}
            >
              {workoutTypeLabel(item)}
            </button>
          ))}
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

      {askResume && onResume ? (
        <ResumeCard
          days={days}
          week={week}
          doneThisWeek={doneCount}
          onResume={onResume}
        />
      ) : null}

      {readyToProceed && nextMonth && onProceed ? (
        <button className="primary proceed" type="button" onClick={onProceed}>
          Proceed to month {nextMonth.month}
        </button>
      ) : null}

      {programFinished ? (
        <p className="lede">Program complete. Nice work.</p>
      ) : null}

      {!started ? (
        <button className="primary start-program" type="button" onClick={onStartProgram}>
          Start program
        </button>
      ) : null}

      {started && slots.length > 0 && !readyToProceed && !programFinished ? (
        <section className="week">
          <h2>Week {week}</h2>
          <ol className="week-strip">
            {slots.map((slot, index) => {
              const isNext = Boolean(featured) && index === firstOpen
              const status = slot.done ? 'Done' : isNext ? 'Next' : ''
              return (
                <li
                  key={`${slot.label}-${index}`}
                  aria-label={[slot.label, status].filter(Boolean).join(', ')}
                  className={[
                    isNext ? 'today' : undefined,
                    slot.done ? 'is-done' : undefined,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="week-day">Session {index + 1}</span>
                  <strong className="week-work">{shortWorkout(slot.label)}</strong>
                  <span className={status ? `status is-${status.toLowerCase()}` : 'status'}>
                    {status}
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

      <ConfirmDialog
        open={ending}
        title="End program"
        body={leftoverLine(program, progress)}
        confirmLabel="End"
        onConfirm={() => {
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
  includeWarmup,
  mode,
  onOpen,
  onStartNext,
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
  includeWarmup: boolean
  mode: SessionMode
  onOpen: (id: string) => void
  onStartNext: (program: Program, session: Session) => void
  onOpenGlossary: () => void
  onNewWorkout: () => void
  onNewProgram: () => void
  onSignOut: () => void
}) {
  const otherBeginner = beginner.filter((program) => program.id !== currentProgram?.id)
  const otherMine = mine.filter((program) => program.id !== currentProgram?.id)
  const started = currentProgress ? isStarted(currentProgress) : false
  const currentMonth = currentProgress?.currentMonth ?? 1
  const phase =
    currentProgram && currentProgress ? currentPhase(currentProgram, currentProgress) : undefined
  const view =
    started && currentProgram && currentProgress
      ? programView(currentProgram, currentProgress)
      : undefined
  const upNext = view && currentProgress ? nextSession(view, currentProgress) : undefined
  const slots = view && currentProgress ? weekSlots(view, currentProgress.weekDoneIds) : []
  const slotIndex = slots.findIndex((slot) => !slot.done)
  const currentMeta =
    started && currentProgram && currentProgress
      ? [
          monthLabel(currentProgram, currentMonth),
          `Week ${currentWeek(currentProgram, currentProgress)}`,
          slots.length && slotIndex >= 0 ? `Session ${slotIndex + 1} of ${slots.length}` : undefined,
        ]
          .filter(Boolean)
          .join(' · ')
      : ''
  const blocked =
    !currentProgram ||
    !currentProgress ||
    needsResumeChoice(currentProgress) ||
    canAdvanceMonth(currentProgram, currentProgress)
  const nextMinutes =
    upNext && view
      ? formatMinutes(estimateSessionSeconds(upNext, view.warmup?.totalSec, includeWarmup, mode))
      : undefined

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
          {phase?.name ? <p className="phase-name">{phase.name}</p> : null}
          {currentMeta ? <p className="current-meta">{currentMeta}</p> : null}
          {upNext && !blocked ? (
            <div className="next-up">
              <p className="eyebrow">Next up</p>
              <strong>{upNext.name}</strong>
              <span className="card-focus">
                {upNext.exercises.length} moves · {nextMinutes}
              </span>
              <button
                className="primary"
                type="button"
                onClick={() => onStartNext(currentProgram, upNext)}
              >
                Start {upNext.name}
              </button>
            </div>
          ) : started && blocked ? (
            <p className="current-meta">
              {currentProgress && needsResumeChoice(currentProgress)
                ? `Back after ${daysSinceActive(currentProgress) ?? 0} days. Choose where to pick up.`
                : 'Month done. Open the program to move on.'}
            </p>
          ) : null}
          <button className="secondary" type="button" onClick={() => onOpen(currentProgram.id)}>
            View program
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
