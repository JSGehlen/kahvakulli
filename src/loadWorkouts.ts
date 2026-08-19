import type { Program } from './types.ts'

export function sequenceIndex(program: Program): number {
  const month = program.duration?.match(/month\s+(\d+)/i)
  if (month) return Number(month[1])
  const level = program.title.match(/level\s+(\d+)/i)
  if (level) return Number(level[1])
  return Number.POSITIVE_INFINITY
}

export function levelLabel(program: Program): string {
  if (program.stage) return program.stage
  const level = program.title.match(/level\s+\d+/i)
  return level ? level[0].replace(/^l/, 'L') : program.title
}

export function displayTitle(program: Program): string {
  const level = program.title.match(/level\s+\d+/i)
  if (level) return level[0].replace(/^l/, 'L')
  return program.title
    .replace(/\s*[—–-]\s*kettlebell\s+program$/i, '')
    .replace(/\s*kettlebell\s+program$/i, '')
    .trim() || program.stage || program.title
}
