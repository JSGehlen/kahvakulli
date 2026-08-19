import { useEffect, useRef, useState } from 'react'
import { cueCountdown, cueDone, cueRest, cueWork } from './audio.ts'
import type { RestoredTimer } from './persist.ts'
import type { Segment } from './types.ts'

export type SessionStatus = 'idle' | 'running' | 'paused' | 'done'

type Engine = {
  status: SessionStatus
  index: number
  remainingMs: number
  endsAt: number | null
  emomResting: boolean
}

function playCue(kind: Segment['kind']): void {
  if (kind === 'work' || kind === 'warmup') cueWork()
  else if (kind === 'rest') cueRest()
  else cueCountdown()
}

function armSegment(e: Engine, segment: Segment, now: number): void {
  if (segment.awaitComplete) {
    e.remainingMs = 0
    e.endsAt = null
    return
  }
  e.remainingMs = segment.durationSec * 1000
  e.endsAt = now + e.remainingMs
}

function engineFromRestore(segments: Segment[], restored?: RestoredTimer): Engine {
  if (!restored) {
    return {
      status: 'idle',
      index: 0,
      remainingMs: (segments[0]?.durationSec ?? 0) * 1000,
      endsAt: null,
      emomResting: false,
    }
  }
  const current = segments[restored.index]
  if (restored.status === 'running') {
    return {
      status: 'running',
      index: restored.index,
      remainingMs: restored.remainingMs,
      endsAt: current?.awaitComplete ? null : performance.now() + restored.remainingMs,
      emomResting: Boolean(restored.emomResting),
    }
  }
  return {
    status: restored.status,
    index: restored.index,
    remainingMs: restored.remainingMs,
    endsAt: null,
    emomResting: Boolean(restored.emomResting),
  }
}

export function useSession(segments: Segment[], restored?: RestoredTimer) {
  const seeded = engineFromRestore(segments, restored)
  const [view, setView] = useState({
    status: seeded.status,
    index: seeded.index,
    remainingMs: seeded.remainingMs,
    emomResting: seeded.emomResting,
  })
  const engine = useRef<Engine>(seeded)
  const segmentsRef = useRef(segments)
  const lastTickSec = useRef<number | null>(null)

  useEffect(() => {
    segmentsRef.current = segments
  }, [segments])

  const publish = () => {
    const e = engine.current
    setView({
      status: e.status,
      index: e.index,
      remainingMs: e.remainingMs,
      emomResting: e.emomResting,
    })
  }

  const advanceLocked = (now: number) => {
    const e = engine.current
    const list = segmentsRef.current
    const nextIndex = e.index + 1
    lastTickSec.current = null
    if (nextIndex >= list.length) {
    e.status = 'done'
    e.remainingMs = 0
    e.endsAt = null
    e.emomResting = false
      cueDone()
      publish()
      return
    }
    const next = list[nextIndex]
    e.index = nextIndex
    e.emomResting = false
    armSegment(e, next, now)
    playCue(next.kind)
    publish()
  }

  useEffect(() => {
    if (view.status !== 'running') return
    let frame = 0
    let lastPublish = 0
    const loop = () => {
      const now = performance.now()
      const e = engine.current
      if (e.status !== 'running' || e.endsAt === null) {
        frame = requestAnimationFrame(loop)
        return
      }
      const remainingMs = e.endsAt - now
      if (remainingMs <= 0) {
        advanceLocked(now)
        frame = requestAnimationFrame(loop)
        return
      }
      e.remainingMs = remainingMs
      const sec = Math.ceil(remainingMs / 1000)
      const current = segmentsRef.current[e.index]
      if (
        sec !== lastTickSec.current &&
        sec > 0 &&
        sec <= 3 &&
        !(current?.hideWorkClock && !e.emomResting)
      ) {
        lastTickSec.current = sec
        cueCountdown()
      }
      if (now - lastPublish > 40) {
        lastPublish = now
        publish()
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [view.status])

  const start = () => {
    const first = segmentsRef.current[0]
    if (!first) return
    lastTickSec.current = null
    const e: Engine = {
      status: 'running',
      index: 0,
      remainingMs: 0,
      endsAt: null,
      emomResting: false,
    }
    armSegment(e, first, performance.now())
    engine.current = e
    playCue(first.kind)
    publish()
  }

  const pause = () => {
    const e = engine.current
    if (e.status !== 'running') return
    if (e.endsAt !== null) {
      e.remainingMs = Math.max(0, e.endsAt - performance.now())
      e.endsAt = null
    }
    e.status = 'paused'
    publish()
  }

  const resume = () => {
    const e = engine.current
    if (e.status !== 'paused') return
    e.status = 'running'
    const current = segmentsRef.current[e.index]
    if (!current?.awaitComplete) {
      e.endsAt = performance.now() + e.remainingMs
    }
    publish()
  }

  const skip = () => {
    const e = engine.current
    if (e.status === 'idle') {
      start()
      return
    }
    if (e.status === 'done') return
    advanceLocked(performance.now())
  }

  const complete = () => {
    const e = engine.current
    const current = segmentsRef.current[e.index]
    if (e.status === 'idle' || e.status === 'done' || e.emomResting) return
    if (current?.awaitComplete) {
      advanceLocked(performance.now())
      return
    }
    e.emomResting = true
    if (e.status === 'paused' && e.remainingMs > 0) {
      e.status = 'running'
      e.endsAt = performance.now() + e.remainingMs
    }
    cueRest()
    publish()
  }

  const segment = segments[view.index]
  const progress =
    segment && segment.durationSec > 0
      ? Math.min(1, Math.max(0, 1 - view.remainingMs / (segment.durationSec * 1000)))
      : 0

  return {
    status: view.status,
    index: view.index,
    remainingMs: view.remainingMs,
    emomResting: view.emomResting,
    segment,
    progress,
    start,
    pause,
    resume,
    skip,
    complete,
  }
}
