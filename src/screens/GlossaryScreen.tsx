import { useMemo, useState } from 'react'
import type { GlossaryEntry, Program } from '../types.ts'

export function collectGlossary(programs: Program[]): GlossaryEntry[] {
  const byName = new Map<string, GlossaryEntry>()
  for (const program of programs) {
    for (const entry of program.glossary) {
      const key = entry.name.toLowerCase()
      const current = byName.get(key)
      if (!current || entry.steps.length + entry.notes.length > current.steps.length + current.notes.length) {
        byName.set(key, entry)
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function GlossaryScreen({
  entries,
  onBack,
}: {
  entries: GlossaryEntry[]
  onBack: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const count = useMemo(() => entries.length, [entries])

  return (
    <main className="page">
      <button className="back" type="button" onClick={onBack}>
        All programs
      </button>
      <p className="eyebrow">Moves</p>
      <h1>Glossary</h1>
      <p className="lede">
        {count} {count === 1 ? 'lift' : 'lifts'}. Open one to see the setup.
      </p>

      {entries.length === 0 ? (
        <section className="empty">
          <h2>No movements yet</h2>
          <p>Add an Exercise Glossary section to a program markdown file.</p>
        </section>
      ) : (
        <ul className="glossary-list">
          {entries.map((entry) => {
            const expanded = open === entry.name
            return (
              <li key={entry.name}>
                <button
                  type="button"
                  className={expanded ? 'is-open' : undefined}
                  onClick={() => setOpen(expanded ? null : entry.name)}
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
                    </>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
