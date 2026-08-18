import { parseWorkoutMarkdown } from './parseWorkout.ts'
import type { Program } from './types.ts'

const files = import.meta.glob('../workouts/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export function loadPrograms(): Program[] {
  return Object.entries(files)
    .map(([path, markdown]) => {
      const sourceFile = path.split('/').pop() ?? path
      return parseWorkoutMarkdown(markdown, sourceFile)
    })
    .filter((program) => program.sessions.length > 0)
    .sort((a, b) => sequenceIndex(a) - sequenceIndex(b) || a.title.localeCompare(b.title))
}

export function sequenceIndex(program: Program): number {
  const month = program.duration?.match(/month\s+(\d+)/i)
  if (month) return Number(month[1])
  const level = program.title.match(/level\s+(\d+)/i)
  if (level) return Number(level[1])
  return Number.POSITIVE_INFINITY
}

export function levelLabel(program: Program): string {
  const level = program.title.match(/level\s+\d+/i)
  return level ? level[0].replace(/^l/, 'L') : program.title
}

export function displayTitle(program: Program): string {
  if (program.stage) return program.stage
  const level = program.title.match(/level\s+\d+/i)
  if (level) return level[0].replace(/^l/, 'L')
  return program.title
    .replace(/\s*[—–-]\s*kettlebell\s+program$/i, '')
    .replace(/\s*kettlebell\s+program$/i, '')
    .trim() || program.title
}
