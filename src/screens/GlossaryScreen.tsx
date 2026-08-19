import { useMemo, useState } from 'react'
import { deleteGlossaryEntry, saveGlossaryEntry } from '../data.ts'
import type { GlossaryEntry } from '../types.ts'

export function GlossaryScreen({
  entries,
  isAdmin,
  onBack,
  onChanged,
}: {
  entries: GlossaryEntry[]
  isAdmin: boolean
  onBack: () => void
  onChanged: () => Promise<void>
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<GlossaryEntry> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const count = useMemo(() => entries.length, [entries])

  const save = async () => {
    if (!editing?.name?.trim()) return
    setBusy(true)
    setError(null)
    try {
      await saveGlossaryEntry({
        id: editing.id,
        name: editing.name,
        steps: (editing.steps ?? []).filter(Boolean),
        notes: (editing.notes ?? []).filter(Boolean),
      })
      setEditing(null)
      await onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save move')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      await deleteGlossaryEntry(id)
      setEditing(null)
      await onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete move')
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    const stepsText = (editing.steps ?? []).join('\n')
    const notesText = (editing.notes ?? []).join('\n')
    return (
      <main className="page">
        <button className="back" type="button" onClick={() => setEditing(null)}>
          Glossary
        </button>
        <p className="eyebrow">Moves</p>
        <h1>{editing.id ? 'Edit move' : 'Add move'}</h1>
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label>
            Name
            <input
              value={editing.name ?? ''}
              onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              required
            />
          </label>
          <label>
            Steps
            <textarea
              rows={8}
              value={stepsText}
              onChange={(event) =>
                setEditing({ ...editing, steps: event.target.value.split('\n') })
              }
            />
          </label>
          <label>
            Notes
            <textarea
              rows={4}
              value={notesText}
              onChange={(event) =>
                setEditing({ ...editing, notes: event.target.value.split('\n') })
              }
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary" type="submit" disabled={busy}>
            Save
          </button>
          {editing.id ? (
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => void remove(editing.id!)}
            >
              Delete
            </button>
          ) : null}
        </form>
      </main>
    )
  }

  return (
    <main className="page">
      <button className="back" type="button" onClick={onBack}>
        All programs
      </button>
      <p className="eyebrow">Moves</p>
      <h1>Glossary</h1>
      <p className="lede">
        {count} {count === 1 ? 'lift' : 'lifts'} shared by everyone. Open one to see the setup.
      </p>
      {isAdmin ? (
        <button
          className="secondary"
          type="button"
          onClick={() => setEditing({ name: '', steps: [], notes: [] })}
        >
          Add move
        </button>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}

      {entries.length === 0 ? (
        <section className="empty">
          <h2>No movements yet</h2>
          <p>The shared glossary is empty until an admin adds a move.</p>
        </section>
      ) : (
        <ul className="glossary-list">
          {entries.map((entry) => {
            const expanded = open === entry.id
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className={expanded ? 'is-open' : undefined}
                  onClick={() => setOpen(expanded ? null : entry.id)}
                >
                  <span className="glossary-name">
                    <strong>{entry.name}</strong>
                    <span className="chevron" aria-hidden="true" />
                  </span>
                  {expanded ? (
                    <>
                      {entry.steps.length > 0 ? (
                        <ol>
                          {entry.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      ) : null}
                      {entry.notes.length > 0 ? (
                        <ul className="glossary-notes">
                          {entry.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      ) : null}
                      {isAdmin ? (
                        <span className="card-action">Edit</span>
                      ) : null}
                    </>
                  ) : null}
                </button>
                {expanded && isAdmin ? (
                  <button
                    className="ghost"
                    type="button"
                    onClick={() => setEditing(entry)}
                  >
                    Edit {entry.name}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
