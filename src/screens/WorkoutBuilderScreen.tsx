import { useMemo, useState } from 'react'
import { deleteWorkout, saveWorkout } from '../data.ts'
import { workoutTypeLabel } from '../timeline.ts'
import type { Exercise, GlossaryEntry, Session, WorkoutType } from '../types.ts'

type DraftMove = Exercise & { key: string }

const TYPES: WorkoutType[] = ['regular', 'emom', 'circuit']

function blankMove(glossary: GlossaryEntry[], type: WorkoutType): DraftMove {
  const first = glossary[0]
  const base = {
    key: crypto.randomUUID(),
    name: first?.name ?? '',
    glossaryId: first?.id,
    notes: [] as string[],
  }
  if (type === 'regular') {
    return { ...base, workSec: 30, restSec: 45 }
  }
  return { ...base, workSec: 0, restSec: 0, reps: 8 }
}

function shapedForType(move: DraftMove, type: WorkoutType): DraftMove {
  if (type === 'regular') {
    if (move.reps) return { ...move, workSec: 0 }
    return { ...move, workSec: move.workSec || 30, reps: undefined }
  }
  return { ...move, workSec: 0, restSec: 0, reps: move.reps || 8 }
}

export function WorkoutBuilderScreen({
  glossary,
  userId,
  existing,
  onBack,
  onSaved,
}: {
  glossary: GlossaryEntry[]
  userId: string
  existing?: Session
  onBack: () => void
  onSaved: () => Promise<void>
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [rounds, setRounds] = useState(existing?.rounds ?? 3)
  const [type, setType] = useState<WorkoutType>(existing?.type ?? 'regular')
  const [roundRest, setRoundRest] = useState(
    existing?.type === 'circuit' ? (existing.exercises.at(-1)?.restSec ?? 45) : 45,
  )
  const [moves, setMoves] = useState<DraftMove[]>(
    existing?.exercises.map((exercise) => ({
      ...exercise,
      key: crypto.randomUUID(),
    })) ?? [blankMove(glossary, existing?.type ?? 'regular')],
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const byId = useMemo(
    () => new Map(glossary.map((entry) => [entry.id, entry])),
    [glossary],
  )

  const selectType = (next: WorkoutType) => {
    setType(next)
    setMoves((current) => current.map((move) => shapedForType(move, next)))
  }

  const save = async () => {
    setError(null)
    if (!name.trim()) {
      setError('Name the workout')
      return
    }
    if (moves.length === 0) {
      setError('Add at least one move')
      return
    }
    if (type !== 'regular' && moves.some((move) => !move.reps)) {
      setError('Each move needs reps')
      return
    }
    if (
      type === 'regular' &&
      moves.some((move) => (move.reps ? move.workSec > 0 : !(move.workSec > 0)))
    ) {
      setError('Each move needs work seconds or reps, not both')
      return
    }
    setBusy(true)
    try {
      await saveWorkout({
        id: existing?.id,
        name,
        rounds,
        type,
        userId,
        exercises: moves.map((move, index, all) => ({
          name: byId.get(move.glossaryId ?? '')?.name ?? move.name,
          workSec: type === 'regular' && !move.reps ? move.workSec : 0,
          restSec:
            type === 'circuit'
              ? index === all.length - 1
                ? roundRest
                : 0
              : type === 'emom'
                ? 0
                : move.restSec,
          reps: type === 'regular' && move.workSec > 0 && !move.reps ? undefined : move.reps,
          target: move.target,
          bell: move.bell,
          notes: move.notes,
          glossaryId: move.glossaryId,
        })),
      })
      await onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save workout')
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!existing) return
    setBusy(true)
    try {
      await deleteWorkout(existing.id)
      await onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete workout')
      setBusy(false)
    }
  }

  if (glossary.length === 0) {
    return (
      <main className="page">
        <button className="back" type="button" onClick={onBack}>
          All programs
        </button>
        <p className="eyebrow">Library</p>
        <h1>New workout</h1>
        <section className="empty">
          <h2>Glossary is empty</h2>
          <p>An admin needs to add moves before you can build a workout.</p>
          <button className="secondary" type="button" onClick={onBack}>
            Cancel
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <button className="back" type="button" onClick={onBack}>
        All programs
      </button>
      <p className="eyebrow">Library</p>
      <h1>{existing ? 'Edit workout' : 'New workout'}</h1>
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <div className="mode-switch types" role="radiogroup" aria-label="Workout type">
          {TYPES.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={type === item}
              className={type === item ? 'is-on' : undefined}
              onClick={() => selectType(item)}
            >
              {workoutTypeLabel(item)}
            </button>
          ))}
        </div>
        <label>
          Rounds
          <input
            type="number"
            min={1}
            value={rounds}
            onChange={(event) => setRounds(Number(event.target.value) || 1)}
          />
        </label>
        {type === 'circuit' ? (
          <label>
            Rest after round (sec)
            <input
              type="number"
              min={0}
              value={roundRest}
              onChange={(event) => setRoundRest(Number(event.target.value) || 0)}
            />
          </label>
        ) : null}
        {moves.map((move, index) => (
          <fieldset key={move.key} className="move-card">
            <legend>Move {index + 1}</legend>
            <label>
              Glossary move
              <select
                value={move.glossaryId ?? ''}
                onChange={(event) => {
                  const entry = byId.get(event.target.value)
                  setMoves((current) =>
                    current.map((item) =>
                      item.key === move.key
                        ? {
                            ...item,
                            glossaryId: entry?.id,
                            name: entry?.name ?? item.name,
                          }
                        : item,
                    ),
                  )
                }}
              >
                {glossary.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            {type === 'regular' ? (
              <div className="field-row">
                <label>
                  Work (sec)
                  <input
                    type="number"
                    min={0}
                    value={move.reps ? '' : move.workSec || ''}
                    onChange={(event) =>
                      setMoves((current) =>
                        current.map((item) =>
                          item.key === move.key
                            ? {
                                ...item,
                                workSec: Number(event.target.value) || 0,
                                reps: undefined,
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Rest (sec)
                  <input
                    type="number"
                    min={0}
                    value={move.restSec}
                    onChange={(event) =>
                      setMoves((current) =>
                        current.map((item) =>
                          item.key === move.key
                            ? { ...item, restSec: Number(event.target.value) || 0 }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
              </div>
            ) : null}
            <div className="field-row">
                <label>
                  Reps
                  <input
                    type="number"
                    min={0}
                    value={move.reps ?? ''}
                    onChange={(event) =>
                      setMoves((current) =>
                        current.map((item) =>
                          item.key === move.key
                            ? {
                                ...item,
                                reps: event.target.value
                                  ? Number(event.target.value)
                                  : undefined,
                                workSec: event.target.value ? 0 : item.workSec || 30,
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Bell
                  <input
                    value={move.bell ?? ''}
                    onChange={(event) =>
                      setMoves((current) =>
                        current.map((item) =>
                          item.key === move.key ? { ...item, bell: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
              </div>
            {moves.length > 1 ? (
              <button
                className="ghost"
                type="button"
                onClick={() => setMoves((current) => current.filter((item) => item.key !== move.key))}
              >
                Remove move
              </button>
            ) : null}
          </fieldset>
        ))}
        <button
          className="secondary"
          type="button"
          onClick={() => setMoves((current) => [...current, blankMove(glossary, type)])}
        >
          Add move
        </button>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary" type="submit" disabled={busy}>
          Save workout
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
    </main>
  )
}
