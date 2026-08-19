import { useEffect, useMemo, useState } from 'react'
import { releaseAudio, unlockAudio } from './audio.ts'
import { useAuth } from './auth.tsx'
import {
  advanceProgramMonth,
  loadGlossary,
  loadProgramProgress,
  loadPrograms,
  loadWeekProgress,
  loadWorkouts,
  markWorkoutDone,
} from './data.ts'
import { displayTitle } from './loadWorkouts.ts'
import {
  clearSavedWorkout,
  emptyWeekProgress,
  loadLastProgramId,
  loadSavedWorkout,
  loadSessionMode,
  replayElapsed,
  saveLastProgramId,
  saveSessionMode,
  saveWorkout as saveActiveSession,
  type RestoredTimer,
  type WeekProgress,
} from './persist.ts'
import { emptyProgramProgress, splitProgramLists } from './programs.ts'
import { AuthScreen } from './screens/AuthScreen.tsx'
import { GlossaryScreen } from './screens/GlossaryScreen.tsx'
import { HomeScreen, ProgramScreen } from './screens/HomeScreen.tsx'
import { ProgramBuilderScreen } from './screens/ProgramBuilderScreen.tsx'
import { DoneScreen, SessionScreen } from './screens/SessionScreen.tsx'
import { WorkoutBuilderScreen } from './screens/WorkoutBuilderScreen.tsx'
import { supabase } from './supabase.ts'
import { buildTimeline, effectiveType } from './timeline.ts'
import type { GlossaryEntry, Program, ProgramProgress, Session, SessionMode } from './types.ts'

type Route =
  | { name: 'home' }
  | { name: 'program'; id: string }
  | { name: 'glossary' }
  | { name: 'new-workout' }
  | { name: 'edit-workout'; id: string }
  | { name: 'new-program' }
  | { name: 'edit-program'; id: string }
  | { name: 'session'; id: string; sessionId: string }
  | { name: 'done'; id: string; sessionId: string }

type Boot = {
  route: Route
  includeWarmup: boolean
  mode: SessionMode
  resume?: RestoredTimer & { programId: string; sessionId: string }
}

function bootstrap(): Boot {
  const saved = loadSavedWorkout()
  if (!saved) {
    return { route: { name: 'home' }, includeWarmup: true, mode: loadSessionMode() }
  }
  return {
    route: { name: 'session', id: saved.programId, sessionId: saved.sessionId },
    includeWarmup: saved.includeWarmup,
    mode: saved.mode === 'emom' ? 'emom' : loadSessionMode(),
    resume: {
      index: saved.index,
      remainingMs: saved.remainingMs,
      status: saved.status,
      emomResting: saved.emomResting,
      programId: saved.programId,
      sessionId: saved.sessionId,
    },
  }
}

export default function App() {
  const { configured, loading, user, profile } = useAuth()
  if (!configured || !user) {
    if (loading) {
      return (
        <main className="page">
          <p className="eyebrow">On the bell</p>
          <h1>Kettlebell</h1>
          <p className="lede">Loading…</p>
        </main>
      )
    }
    return <AuthScreen />
  }
  return <SignedInApp userId={user.id} isAdmin={Boolean(profile?.isAdmin)} />
}

function SignedInApp({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [boot] = useState(bootstrap)
  const [route, setRoute] = useState<Route>(boot.route)
  const [includeWarmup, setIncludeWarmup] = useState(boot.includeWarmup)
  const [mode, setMode] = useState<SessionMode>(boot.mode)
  const [resume, setResume] = useState(boot.resume)
  const [lastProgramId, setLastProgramId] = useState(() => loadLastProgramId())
  const [weekProgress, setWeekProgress] = useState<WeekProgress>(emptyWeekProgress)
  const [programProgress, setProgramProgress] = useState<Record<string, ProgramProgress>>({})
  const [programs, setPrograms] = useState<Program[]>([])
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([])
  const [workouts, setWorkouts] = useState<Session[]>([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = async () => {
    const entries = await loadGlossary()
    const [nextPrograms, nextWorkouts, progress, months] = await Promise.all([
      loadPrograms(entries),
      loadWorkouts(),
      loadWeekProgress(userId),
      loadProgramProgress(userId),
    ])
    setGlossary(entries)
    setPrograms(nextPrograms)
    setWorkouts(nextWorkouts)
    setWeekProgress(progress)
    setProgramProgress(months)
  }

  useEffect(() => {
    let ignore = false
    reload()
      .then(() => {
        if (!ignore) setReady(true)
      })
      .catch((caught: unknown) => {
        if (ignore) return
        setLoadError(caught instanceof Error ? caught.message : 'Could not load programs')
        setReady(true)
      })
    return () => {
      ignore = true
    }
  }, [userId])

  const lists = useMemo(() => splitProgramLists(programs, userId), [programs, userId])
  const currentProgram =
    programs.find((item) => item.id === lastProgramId) ?? lists.beginner[0] ?? programs[0]

  const program = programs.find((item) => 'id' in route && item.id === route.id)
  const session =
    program && (route.name === 'session' || route.name === 'done')
      ? program.sessions.find((item) => item.id === route.sessionId)
      : undefined

  useEffect(() => {
    if (route.name !== 'session' || !ready) return
    const found = programs.find((item) => item.id === route.id)
    const foundSession = found?.sessions.find((item) => item.id === route.sessionId)
    if (!found || !foundSession) {
      clearSavedWorkout()
      setResume(undefined)
      setRoute({ name: 'home' })
      return
    }
    if (resume && resume.status === 'done') {
      void markWorkoutDone(userId, found.id, foundSession.id).then((result) => {
        setWeekProgress(result.week)
        setProgramProgress(result.programs)
      })
      setRoute({ name: 'done', id: found.id, sessionId: foundSession.id })
    }
  }, [ready, programs, route, resume, userId])

  const rememberProgram = (id: string) => {
    saveLastProgramId(id)
    setLastProgramId(id)
  }

  const startSession = async (next: Session, programId: string) => {
    rememberProgram(programId)
    clearSavedWorkout()
    setResume(undefined)
    await unlockAudio()
    setRoute({ name: 'session', id: programId, sessionId: next.id })
  }

  const leaveWorkout = (next: Route) => {
    clearSavedWorkout()
    setResume(undefined)
    void releaseAudio()
    setRoute(next)
  }

  if (!ready) {
    return (
      <main className="page">
        <p className="eyebrow">On the bell</p>
        <h1>Kettlebell</h1>
        <p className="lede">Loading your programs…</p>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="page">
        <p className="eyebrow">Setup</p>
        <h1>Couldn’t load</h1>
        <p className="lede">{loadError}</p>
        <p className="lede">
          Run <code>supabase/schema.sql</code> then paste <code>supabase/seed.sql</code> in the
          SQL editor.
        </p>
      </main>
    )
  }

  if (route.name === 'glossary') {
    return (
      <GlossaryScreen
        entries={glossary}
        isAdmin={isAdmin}
        onBack={() => setRoute({ name: 'home' })}
        onChanged={reload}
      />
    )
  }

  if (route.name === 'new-workout' || route.name === 'edit-workout') {
    const existing =
      route.name === 'edit-workout'
        ? workouts.find((item) => item.id === route.id)
        : undefined
    return (
      <WorkoutBuilderScreen
        glossary={glossary}
        userId={userId}
        existing={existing}
        onBack={() => setRoute({ name: 'home' })}
        onSaved={async () => {
          await reload()
          setRoute({ name: 'home' })
        }}
      />
    )
  }

  if (route.name === 'new-program' || route.name === 'edit-program') {
    const existing =
      route.name === 'edit-program'
        ? programs.find((item) => item.id === route.id)
        : undefined
    return (
      <ProgramBuilderScreen
        userId={userId}
        workouts={workouts}
        existing={existing}
        onBack={() => setRoute({ name: 'home' })}
        onNeedWorkout={() => setRoute({ name: 'new-workout' })}
        onSaved={async (id) => {
          await reload()
          setRoute(id ? { name: 'program', id } : { name: 'home' })
        }}
      />
    )
  }

  if (route.name === 'home') {
    return (
      <HomeScreen
        beginner={lists.beginner}
        mine={lists.mine}
        others={lists.others}
        currentProgram={currentProgram}
        currentMonth={
          currentProgram
            ? (programProgress[currentProgram.id]?.currentMonth ?? 1)
            : undefined
        }
        onOpen={(id) => {
          rememberProgram(id)
          setRoute({ name: 'program', id })
        }}
        onOpenGlossary={() => setRoute({ name: 'glossary' })}
        onNewWorkout={() => setRoute({ name: 'new-workout' })}
        onNewProgram={() => setRoute({ name: 'new-program' })}
        onSignOut={() => void supabase?.auth.signOut()}
      />
    )
  }

  if (!program) {
    return (
      <HomeScreen
        beginner={lists.beginner}
        mine={lists.mine}
        others={lists.others}
        currentProgram={currentProgram}
        currentMonth={
          currentProgram
            ? (programProgress[currentProgram.id]?.currentMonth ?? 1)
            : undefined
        }
        onOpen={(id) => {
          rememberProgram(id)
          setRoute({ name: 'program', id })
        }}
        onOpenGlossary={() => setRoute({ name: 'glossary' })}
        onNewWorkout={() => setRoute({ name: 'new-workout' })}
        onNewProgram={() => setRoute({ name: 'new-program' })}
        onSignOut={() => void supabase?.auth.signOut()}
      />
    )
  }

  if (route.name === 'program') {
    return (
      <ProgramScreen
        program={program}
        progress={programProgress[program.id] ?? emptyProgramProgress()}
        includeWarmup={includeWarmup}
        mode={mode}
        doneSessionIds={weekProgress.byProgram[program.id] ?? []}
        canEdit={program.userId === userId && !program.isBuiltin}
        onToggleWarmup={() => setIncludeWarmup((value) => !value)}
        onModeChange={(next) => {
          saveSessionMode(next)
          setMode(next)
        }}
        onBack={() => setRoute({ name: 'home' })}
        onStart={(next) => void startSession(next, program.id)}
        onProceed={() => {
          const current = programProgress[program.id]?.currentMonth ?? 1
          void advanceProgramMonth(userId, program.id, current + 1).then((next) => {
            setProgramProgress(next)
            setWeekProgress((prev) => ({
              ...prev,
              byProgram: { ...prev.byProgram, [program.id]: [] },
            }))
          })
        }}
        onEdit={() => setRoute({ name: 'edit-program', id: program.id })}
      />
    )
  }

  if (route.name === 'session' && session) {
    const segments = buildTimeline(program, session, includeWarmup, mode)
    if (segments.length === 0) {
      clearSavedWorkout()
      return (
        <ProgramScreen
          program={program}
          progress={programProgress[program.id] ?? emptyProgramProgress()}
          includeWarmup={includeWarmup}
          mode={mode}
          doneSessionIds={weekProgress.byProgram[program.id] ?? []}
          onToggleWarmup={() => setIncludeWarmup((value) => !value)}
          onModeChange={(next) => {
            saveSessionMode(next)
            setMode(next)
          }}
          onBack={() => setRoute({ name: 'home' })}
          onStart={(next) => void startSession(next, program.id)}
          onProceed={() => {
            const current = programProgress[program.id]?.currentMonth ?? 1
            void advanceProgramMonth(userId, program.id, current + 1).then((next) => {
              setProgramProgress(next)
              setWeekProgress((prev) => ({
                ...prev,
                byProgram: { ...prev.byProgram, [program.id]: [] },
              }))
            })
          }}
        />
      )
    }
    const saved = loadSavedWorkout()
    const restored =
      saved && saved.programId === program.id && saved.sessionId === session.id
        ? replayElapsed(saved, segments)
        : undefined
    return (
      <SessionScreen
        key={`${session.id}-${mode}-${restored ? 'resume' : 'fresh'}`}
        title={displayTitle(program)}
        sessionName={session.name}
        workoutType={effectiveType(session, mode)}
        segments={segments}
        glossary={glossary}
        restored={restored}
        onPersist={(state) =>
          saveActiveSession({
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
          void markWorkoutDone(userId, program.id, session.id).then((result) => {
            setWeekProgress(result.week)
            setProgramProgress(result.programs)
          })
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
