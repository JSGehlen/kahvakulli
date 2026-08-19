import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { matchGlossary, parseWorkoutMarkdown } from '../src/parseWorkout.ts'
import type { GlossaryEntry, Program } from '../src/types.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function idFor(kind: string, key: string): string {
  const hash = createHash('sha1').update(`${kind}:${key}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

function sql(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return `'{}'`
    if (typeof value[0] === 'string') {
      return `ARRAY[${value.map((item) => sql(item)).join(', ')}]::text[]`
    }
  }
  if (typeof value === 'object') return sql(JSON.stringify(value))
  return `'${String(value).replaceAll("'", "''")}'`
}

function loadMarkdownMonths(): Program[] {
  const dir = join(root, 'workouts')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => parseWorkoutMarkdown(readFileSync(join(dir, file), 'utf8'), file))
    .filter((program) => program.sessions.length > 0)
    .sort((a, b) => monthNumber(a) - monthNumber(b))
}

function monthNumber(program: Program): number {
  const n = program.duration?.match(/(\d+)/)
  return n ? Number(n[1]) : 1
}

function mergeGlossary(programs: Program[]): GlossaryEntry[] {
  const byName = new Map<string, GlossaryEntry>()
  for (const program of programs) {
    for (const entry of program.glossary) {
      const key = entry.name.toLowerCase()
      const current = byName.get(key)
      if (
        !current ||
        entry.steps.length + entry.notes.length > current.steps.length + current.notes.length
      ) {
        byName.set(key, { ...entry, id: idFor('glossary', key), isBuiltin: true })
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function unique(items: string[]): string[] {
  return [...new Set(items)]
}

function buildSeed() {
  const months = loadMarkdownMonths()
  const glossary = mergeGlossary(months)
  const statements: string[] = [
    '-- Generated from workouts/*.md. Re-run with `npm run seed`.',
    'truncate table public.program_progress, public.week_progress, public.program_schedule, public.program_workouts, public.workout_exercises, public.workouts, public.programs, public.glossary_entries restart identity cascade;',
  ]

  for (const entry of glossary) {
    statements.push(
      `insert into public.glossary_entries (id, name, steps, notes, is_builtin) values (${sql(entry.id)}, ${sql(entry.name)}, ${sql(entry.steps)}, ${sql(entry.notes)}, true);`,
    )
  }

  const programId = idFor('program', 'beginner-3-month')
  const phases = months.map((month) => ({
    month: monthNumber(month),
    name: month.stage ?? `Month ${monthNumber(month)}`,
    focus: month.focus,
  }))

  statements.push(
    `insert into public.programs (id, user_id, title, stage, duration, difficulty, focus, equipment, warmup, phases, is_builtin, is_public, sort) values (${sql(programId)}, null, ${sql('Beginner 3 month program')}, null, ${sql('3 months')}, ${sql('Beginner')}, null, ${sql(unique(months.flatMap((month) => month.equipment)))}, ${sql(months[0]?.warmup ?? null)}::jsonb, ${sql(phases)}::jsonb, true, true, 0);`,
  )

  months.forEach((monthProgram) => {
    const month = monthNumber(monthProgram)
    monthProgram.sessions.forEach((session, sessionIndex) => {
      const workoutId = idFor('workout', `${monthProgram.sourceFile}:${session.name}`)
      statements.push(
        `insert into public.workouts (id, user_id, name, rounds, type, is_builtin, is_public) values (${sql(workoutId)}, null, ${sql(session.name)}, ${session.rounds}, 'regular', true, true);`,
      )
      statements.push(
        `insert into public.program_workouts (program_id, workout_id, sort, month) values (${sql(programId)}, ${sql(workoutId)}, ${month * 10 + sessionIndex}, ${month});`,
      )
      session.exercises.forEach((exercise, sort) => {
        const matched = matchGlossary(exercise.name, glossary)
        const timed = exercise.workSec > 0
        statements.push(
          `insert into public.workout_exercises (workout_id, glossary_id, name, sort, work_sec, rest_sec, reps, target, bell, notes) values (${sql(workoutId)}, ${sql(matched?.id ?? null)}, ${sql(exercise.name)}, ${sort}, ${timed ? exercise.workSec : 0}, ${exercise.restSec}, ${sql(exercise.reps ?? null)}, ${sql(exercise.target ?? null)}, ${sql(exercise.bell ?? null)}, ${sql(exercise.notes)});`,
        )
      })
    })
    for (const row of monthProgram.schedule) {
      const workoutId = idFor('workout', `${monthProgram.sourceFile}:${row.workout}`)
      statements.push(
        `insert into public.program_schedule (program_id, day, workout_id, month) values (${sql(programId)}, ${sql(row.day)}, ${sql(workoutId)}, ${month});`,
      )
    }
  })

  return `${statements.join('\n')}\n`
}

const sqlText = buildSeed()
writeFileSync(join(root, 'supabase/seed.sql'), sqlText)
console.log(`Wrote supabase/seed.sql (${sqlText.split('\n').length} lines)`)
