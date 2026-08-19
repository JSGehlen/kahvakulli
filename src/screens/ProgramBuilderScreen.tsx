import { useMemo, useState } from 'react'
import { deleteProgram, saveProgram } from '../data.ts'
import type { Program, Session, Warmup } from '../types.ts'
import { DEFAULT_WARMUP } from '../types.ts'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function ProgramBuilderScreen({
  userId,
  workouts,
  existing,
  onBack,
  onNeedWorkout,
  onSaved,
}: {
  userId: string
  workouts: Session[]
  existing?: Program
  onBack: () => void
  onNeedWorkout: () => void
  onSaved: (id: string) => Promise<void>
}) {
  const mine = useMemo(
    () => workouts.filter((workout) => workout.userId === userId || workout.isBuiltin),
    [workouts, userId],
  )
  const [title, setTitle] = useState(existing?.title ?? '')
  const [stage, setStage] = useState(existing?.stage ?? '')
  const [duration, setDuration] = useState(existing?.duration ?? '')
  const [focus, setFocus] = useState(existing?.focus ?? '')
  const [equipment, setEquipment] = useState(existing?.equipment.join(', ') ?? '')
  const [isPublic, setIsPublic] = useState(Boolean(existing?.isPublic))
  const [includeWarmup, setIncludeWarmup] = useState(Boolean(existing?.warmup) || !existing)
  const [selected, setSelected] = useState<string[]>(
    existing?.sessions.map((session) => session.id) ?? mine.slice(0, 1).map((item) => item.id),
  )
  const [schedule, setSchedule] = useState<Record<string, string>>(
    Object.fromEntries(
      (existing?.schedule ?? []).map((row) => {
        const workout = existing?.sessions.find((session) => session.name === row.workout)
        return [row.day, workout?.id ?? '']
      }),
    ),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selectedWorkouts = mine.filter((workout) => selected.includes(workout.id))
  const warmup: Warmup | undefined = includeWarmup ? existing?.warmup ?? DEFAULT_WARMUP : undefined

  const save = async () => {
    setError(null)
    if (!title.trim()) {
      setError('Name the program')
      return
    }
    if (selected.length === 0) {
      setError('Add at least one workout')
      return
    }
    const days = DAYS.filter((day) => schedule[day])
    setBusy(true)
    try {
      const id = await saveProgram({
        id: existing?.id,
        userId,
        title,
        stage: stage || undefined,
        duration: duration || undefined,
        focus: focus || undefined,
        equipment: equipment.split(',').map((item) => item.trim()).filter(Boolean),
        warmup,
        isPublic,
        workoutIds: selected,
        schedule: days.map((day) => ({ day, workoutId: schedule[day] })),
      })
      await onSaved(id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save program')
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!existing) return
    setBusy(true)
    try {
      await deleteProgram(existing.id)
      await onSaved('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete program')
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <button className="back" type="button" onClick={onBack}>
        All programs
      </button>
      <p className="eyebrow">Library</p>
      <h1>{existing ? 'Edit program' : 'New program'}</h1>
      {mine.length === 0 ? (
        <section className="empty">
          <h2>No workouts yet</h2>
          <p>Create a workout from the glossary first, then build a program around it.</p>
          <button className="primary" type="button" onClick={onNeedWorkout}>
            New workout
          </button>
          <button className="secondary" type="button" onClick={onBack}>
            Cancel
          </button>
        </section>
      ) : (
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            Name on the card
            <input
              value={stage}
              onChange={(event) => setStage(event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label>
            Duration
            <input
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              placeholder="Month 1"
            />
          </label>
          <label>
            Focus
            <textarea rows={3} value={focus} onChange={(event) => setFocus(event.target.value)} />
          </label>
          <label>
            Equipment
            <input
              value={equipment}
              onChange={(event) => setEquipment(event.target.value)}
              placeholder="16 kg kettlebell"
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={includeWarmup}
              onChange={() => setIncludeWarmup((value) => !value)}
            />
            <span className="switch" aria-hidden="true" />
            Include 4 min warm-up
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={() => setIsPublic((value) => !value)}
            />
            <span className="switch" aria-hidden="true" />
            Public — anyone can start this program
          </label>

          <h2>Workouts</h2>
          <ul className="pick-list">
            {mine.map((workout) => {
              const on = selected.includes(workout.id)
              return (
                <li key={workout.id}>
                  <label className="pick">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setSelected((current) =>
                          on
                            ? current.filter((id) => id !== workout.id)
                            : [...current, workout.id],
                        )
                      }
                    />
                    {workout.name}
                    {workout.isBuiltin ? ' · Beginner' : ''}
                  </label>
                </li>
              )
            })}
          </ul>
          <button className="ghost" type="button" onClick={onNeedWorkout}>
            New workout
          </button>

          <h2>This week</h2>
          {DAYS.map((day) => (
            <label key={day}>
              {day}
              <select
                value={schedule[day] ?? ''}
                onChange={(event) =>
                  setSchedule((current) => ({ ...current, [day]: event.target.value }))
                }
              >
                <option value="">Rest</option>
                {selectedWorkouts.map((workout) => (
                  <option key={workout.id} value={workout.id}>
                    {workout.name}
                  </option>
                ))}
              </select>
            </label>
          ))}

          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary" type="submit" disabled={busy}>
            Save program
          </button>
          <button className="secondary" type="button" disabled={busy} onClick={onBack}>
            Cancel
          </button>
          {existing ? (
            <button className="secondary" type="button" disabled={busy} onClick={() => void remove()}>
              Delete
            </button>
          ) : null}
        </form>
      )}
    </main>
  )
}
