import { useMemo, useState } from 'react'
import { releaseAudio, unlockAudio } from './audio.ts'
import { displayTitle, loadPrograms } from './loadWorkouts.ts'
import {
  clearSavedWorkout,
  loadLastProgramId,
  loadSavedWorkout,
  loadSessionMode,
  loadWeekProgress,
  markSessionDone,
  replayElapsed,
  saveLastProgramId,
  saveSessionMode,
  saveWorkout,
  type RestoredTimer,
} from './persist.ts'
import { HomeScreen, ProgramScreen } from './screens/HomeScreen.tsx'
import { collectGlossary, GlossaryScreen } from './screens/GlossaryScreen.tsx'
import { DoneScreen, SessionScreen } from './screens/SessionScreen.tsx'
import { buildTimeline } from './timeline.ts'
import type { Program, Session, SessionMode } from './types.ts'

type Route =
  | { name: 'home' }
  | { name: 'program'; id: string }
  | { name: 'glossary' }
  | { name: 'session'; id: string; sessionId: string }
  | { name: 'done'; id: string; sessionId: string }

type Boot = {
  route: Route
  includeWarmup: boolean
  mode: SessionMode
  resume?: RestoredTimer & { programId: string; sessionId: string }
}

function bootstrap(programs: Program[]): Boot {
  const saved = loadSavedWorkout()
  if (!saved) {
    return { route: { name: 'home' }, includeWarmup: true, mode: loadSessionMode() }
  }

  const program = programs.find((item) => item.id === saved.programId)
  const session = program?.sessions.find((item) => item.id === saved.sessionId)
  if (!program || !session) {
    clearSavedWorkout()
    return { route: { name: 'home' }, includeWarmup: true, mode: loadSessionMode() }
  }

  const mode = saved.mode === 'emom' ? 'emom' : 'regular'
  const segments = buildTimeline(program, session, saved.includeWarmup, mode)
  if (segments.length === 0) {
    clearSavedWorkout()
    return {
      route: { name: 'program', id: program.id },
      includeWarmup: saved.includeWarmup,
      mode,
    }
  }

  const timer = replayElapsed(saved, segments)
  if (timer.status === 'done') {
    markSessionDone(loadWeekProgress(), program.id, session.id)
    return {
      route: { name: 'done', id: program.id, sessionId: session.id },
      includeWarmup: saved.includeWarmup,
      mode,
    }
  }

  return {
    route: { name: 'session', id: program.id, sessionId: session.id },
    includeWarmup: saved.includeWarmup,
    mode,
    resume: { ...timer, programId: program.id, sessionId: session.id },
  }
}

export default function App() {
  const programs = useMemo(() => loadPrograms(), [])
  const [boot] = useState(() => bootstrap(programs))
  const [route, setRoute] = useState<Route>(boot.route)
  const [includeWarmup, setIncludeWarmup] = useState(boot.includeWarmup)
  const [mode, setMode] = useState<SessionMode>(boot.mode)
  const [resume, setResume] = useState(boot.resume)

  const [lastProgramId, setLastProgramId] = useState(() => loadLastProgramId())
  const [weekProgress, setWeekProgress] = useState(() => loadWeekProgress())
  const currentProgram =
    programs.find((item) => item.id === lastProgramId) ?? programs[0]

  const completeSession = (programId: string, sessionId: string) => {
    setWeekProgress((current) => markSessionDone(current, programId, sessionId))
  }

  const program = programs.find((item) => 'id' in route && item.id === route.id)
  const session =
    program && (route.name === 'session' || route.name === 'done')
      ? program.sessions.find((item) => item.id === route.sessionId)
      : undefined

  const rememberProgram = (id: string) => {
    saveLastProgramId(id)
    setLastProgramId(id)
  }

  const startSession = async (next: Session) => {
    if (!program) return
    rememberProgram(program.id)
    clearSavedWorkout()
    setResume(undefined)
    await unlockAudio()
    setRoute({ name: 'session', id: program.id, sessionId: next.id })
  }

  const startToday = async (next: Session) => {
    if (!currentProgram) return
    rememberProgram(currentProgram.id)
    clearSavedWorkout()
    setResume(undefined)
    await unlockAudio()
    setRoute({ name: 'session', id: currentProgram.id, sessionId: next.id })
  }

  const openHome = () => (
    <HomeScreen
      programs={programs}
      currentProgram={currentProgram}
      doneSessionIds={weekProgress.byProgram[currentProgram?.id ?? ''] ?? []}
      mode={mode}
      onOpen={(id) => {
        rememberProgram(id)
        setRoute({ name: 'program', id })
      }}
      onStartToday={startToday}
      onOpenGlossary={() => setRoute({ name: 'glossary' })}
    />
  )

  const leaveWorkout = (next: Route) => {
    clearSavedWorkout()
    setResume(undefined)
    void releaseAudio()
    setRoute(next)
  }

  if (route.name === 'home') {
    return openHome()
  }

  if (route.name === 'glossary') {
    return (
      <GlossaryScreen
        entries={collectGlossary(programs)}
        onBack={() => setRoute({ name: 'home' })}
      />
    )
  }

  if (!program) {
    return openHome()
  }

  if (route.name === 'program') {
    return (
      <ProgramScreen
        program={program}
        previous={programs[programs.findIndex((item) => item.id === program.id) - 1]}
        includeWarmup={includeWarmup}
        mode={mode}
        doneSessionIds={weekProgress.byProgram[program.id] ?? []}
        onToggleWarmup={() => setIncludeWarmup((value) => !value)}
        onModeChange={(next) => {
          saveSessionMode(next)
          setMode(next)
        }}
        onBack={() => setRoute({ name: 'home' })}
        onStart={startSession}
      />
    )
  }

  if (route.name === 'session' && session) {
    const segments = buildTimeline(program, session, includeWarmup, mode)
    const restored =
      resume && resume.programId === program.id && resume.sessionId === session.id
        ? resume
        : undefined
    return (
      <SessionScreen
        key={`${session.id}-${mode}-${restored ? 'resume' : 'fresh'}`}
        title={displayTitle(program)}
        sessionName={session.name}
        mode={mode}
        segments={segments}
        glossary={program.glossary}
        restored={restored}
        onPersist={(state) =>
          saveWorkout({
            version: 1,
            programId: program.id,
            sessionId: session.id,
            includeWarmup,
            mode,
            ...state,
            savedAt: Date.now(),
          })
        }
        onExit={() => leaveWorkout({ name: 'program', id: program.id })}
        onDone={() => {
          completeSession(program.id, session.id)
          window.setTimeout(() => {
            void releaseAudio()
          }, 900)
          setRoute({ name: 'done', id: program.id, sessionId: session.id })
        }}
      />
    )
  }

  return (
    <DoneScreen
      sessionName={session?.name ?? 'Workout'}
      programTitle={displayTitle(program)}
      onHome={() => leaveWorkout({ name: 'program', id: program.id })}
    />
  )
}
