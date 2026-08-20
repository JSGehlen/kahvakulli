import { useMemo, useState } from 'react'
import { deleteWorkout, saveWorkout } from '../data.ts'
import { orderedTypes, workoutTypeLabel } from '../timeline.ts'
import type { Exercise, GlossaryEntry, Session, WorkoutType } from '../types.ts'
import { WORKOUT_TYPES } from '../types.ts'

type DraftMove = Exercise & { key: string }
type RegularStyle = 'work' | 'reps'

function blankMove(glossary: GlossaryEntry[]): DraftMove {
  const first = glossary[0]
  return {
    key: crypto.randomUUID(),
    name: first?.name ?? '',
    glossaryId: first?.id,
    notes: [],
    workSec: 30,
    restSec: 45,
  }
}

function inferRegularStyle(session?: Session): RegularStyle {
  if (!session?.exercises.length) return 'work'
  return session.exercises.every((exercise) => exercise.reps && !(exercise.workSec > 0))
    ? 'reps'
    : 'work'
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
  const [types, setTypes] = useState<WorkoutType[]>(
    existing?.types?.length ? existing.types : [existing?.type ?? 'regular'],
  )
  const [regularStyle, setRegularStyle] = useState<RegularStyle>(() => inferRegularStyle(existing))
  const [roundRest, setRoundRest] = useState(
    existing?.roundRestSec ??
      (existing?.type === 'circuit' ? (existing.exercises.at(-1)?.restSec ?? 45) : 45),
  )
  const [moves, setMoves] = useState<DraftMove[]>(
    existing?.exercises.map((exercise) => ({
      ...exercise,
      key: crypto.randomUUID(),
    })) ?? [blankMove(glossary)],
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const byId = useMemo(
    () => new Map(glossary.map((entry) => [entry.id, entry])),
    [glossary],
  )

  const has = (type: WorkoutType) => types.includes(type)
  const needsReps = has('emom') || has('circuit') || (has('regular') && regularStyle === 'reps')

  const patchMove = (key: string, patch: Partial<DraftMove>) => {
    setMoves((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )
  }

  const toggleType = (item: WorkoutType) => {
    setTypes((current) => {
      if (current.includes(item)) {
        const next = current.filter((type) => type !== item)
        return next.length > 0 ? next : current
      }
      return orderedTypes([...current, item])
    })
    if (item === 'emom' || item === 'circuit') {
      setMoves((current) =>
        current.map((move) => ({ ...move, reps: move.reps || 8 })),
      )
    }
  }

  const selectRegularStyle = (next: RegularStyle) => {
    setRegularStyle(next)
    setMoves((current) =>
      current.map((move) =>
        next === 'work'
          ? {
              ...move,
              workSec: move.workSec || 30,
              reps: has('emom') || has('circuit') ? move.reps : undefined,
            }
          : {
              ...move,
              workSec: 0,
              reps: move.reps || 8,
              restSec: move.restSec || 45,
            },
      ),
    )
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
    if (has('regular') && regularStyle === 'work' && moves.some((move) => !(move.workSec > 0))) {
      setError('Each move needs work seconds')
      return
    }
    if (needsReps && moves.some((move) => !move.reps)) {
      setError('Each move needs reps')
      return
    }
    setBusy(true)
    try {
      await saveWorkout({
        id: existing?.id,
        name,
        rounds,
        types: orderedTypes(types),
        roundRestSec: has('circuit') ? roundRest : 0,
        userId,
        exercises: moves.map((move) => ({
          name: byId.get(move.glossaryId ?? '')?.name ?? move.name,
          workSec: has('regular') && regularStyle === 'work' ? move.workSec : 0,
          restSec: has('regular') ? move.restSec : 0,
          reps: needsReps ? move.reps : undefined,
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
        <div className="mode-switch types" role="group" aria-label="Workout types">
          {WORKOUT_TYPES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={has(item)}
              className={has(item) ? 'is-on' : undefined}
              onClick={() => toggleType(item)}
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

        {moves.map((move, index) => (
          <fieldset key={move.key} className="move-card">
            <legend>Move {index + 1}</legend>
            <label>
              Glossary move
              <select
                value={move.glossaryId ?? ''}
                onChange={(event) => {
                  const entry = byId.get(event.target.value)
                  patchMove(move.key, {
                    glossaryId: entry?.id,
                    name: entry?.name ?? move.name,
                  })
                }}
              >
                {glossary.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Bell
              <input
                value={move.bell ?? ''}
                onChange={(event) => patchMove(move.key, { bell: event.target.value })}
              />
            </label>
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
          onClick={() => setMoves((current) => [...current, blankMove(glossary)])}
        >
          Add move
        </button>

        {has('regular') ? (
          <fieldset className="move-card">
            <legend>Regular</legend>
            <div className="mode-switch" role="radiogroup" aria-label="Regular timing">
              <button
                type="button"
                role="radio"
                aria-checked={regularStyle === 'work'}
                className={regularStyle === 'work' ? 'is-on' : undefined}
                onClick={() => selectRegularStyle('work')}
              >
                Work
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={regularStyle === 'reps'}
                className={regularStyle === 'reps' ? 'is-on' : undefined}
                onClick={() => selectRegularStyle('reps')}
              >
                Reps
              </button>
            </div>
            {moves.map((move) => (
              <div key={move.key} className="variant-move">
                <strong>{move.name || 'Move'}</strong>
                <div className="field-row">
                  {regularStyle === 'work' ? (
                    <label>
                      Work (sec)
                      <input
                        type="number"
                        min={0}
                        value={move.workSec || ''}
                        onChange={(event) =>
                          patchMove(move.key, { workSec: Number(event.target.value) || 0 })
                        }
                      />
                    </label>
                  ) : (
                    <label>
                      Reps
                      <input
                        type="number"
                        min={0}
                        value={move.reps ?? ''}
                        onChange={(event) =>
                          patchMove(move.key, {
                            reps: event.target.value ? Number(event.target.value) : undefined,
                          })
                        }
                      />
                    </label>
                  )}
                  <label>
                    Rest (sec)
                    <input
                      type="number"
                      min={0}
                      value={move.restSec}
                      onChange={(event) =>
                        patchMove(move.key, { restSec: Number(event.target.value) || 0 })
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
          </fieldset>
        ) : null}

        {has('emom') ? (
          <fieldset className="move-card">
            <legend>EMOM</legend>
            {moves.map((move) => (
              <div key={move.key} className="variant-move">
                <strong>{move.name || 'Move'}</strong>
                <label>
                  Reps
                  <input
                    type="number"
                    min={0}
                    value={move.reps ?? ''}
                    onChange={(event) =>
                      patchMove(move.key, {
                        reps: event.target.value ? Number(event.target.value) : undefined,
                      })
                    }
                  />
                </label>
              </div>
            ))}
          </fieldset>
        ) : null}

        {has('circuit') ? (
          <fieldset className="move-card">
            <legend>Circuit</legend>
            <label>
              Rest after round (sec)
              <input
                type="number"
                min={0}
                value={roundRest}
                onChange={(event) => setRoundRest(Number(event.target.value) || 0)}
              />
            </label>
            {moves.map((move) => (
              <div key={move.key} className="variant-move">
                <strong>{move.name || 'Move'}</strong>
                <label>
                  Reps
                  <input
                    type="number"
                    min={0}
                    value={move.reps ?? ''}
                    onChange={(event) =>
                      patchMove(move.key, {
                        reps: event.target.value ? Number(event.target.value) : undefined,
                      })
                    }
                  />
                </label>
              </div>
            ))}
          </fieldset>
        ) : null}

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
