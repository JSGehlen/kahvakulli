import { useState } from 'react'
import { supabase, supabaseConfigured } from '../supabase.ts'

export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  if (!supabaseConfigured || !supabase) {
    return (
      <main className="page">
        <p className="eyebrow">Setup</p>
        <h1>Connect Supabase</h1>
        <p className="lede">
          Copy <code>.env.example</code> to <code>.env.local</code> and add your project URL and
          publishable key, then restart the dev server.
        </p>
      </main>
    )
  }

  const client = supabase

  const submit = async () => {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { error: signError } = await client.auth.signUp({ email, password })
        if (signError) throw signError
        setNotice('Check your email if confirmation is enabled, then sign in.')
      } else {
        const { error: signError } = await client.auth.signInWithPassword({ email, password })
        if (signError) throw signError
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">On the bell</p>
      <h1>Kettlebell</h1>
      <p className="lede">Sign in to train, then build your own programs from the glossary.</p>
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="lede">{notice}</p> : null}
        <button className="primary" type="submit" disabled={busy}>
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <button
          className="ghost"
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin' ? 'Need an account?' : 'Have an account?'}
        </button>
      </form>
    </main>
  )
}
