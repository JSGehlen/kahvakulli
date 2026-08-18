import { haptic } from './haptics.ts'

let context: AudioContext | undefined

function audioSession(): { type: string } | undefined {
  return (navigator as Navigator & { audioSession?: { type: string } }).audioSession
}

function setPlaybackSession(): void {
  const session = audioSession()
  if (session) session.type = 'playback'
}

function setIdleSession(): void {
  const session = audioSession()
  if (session) session.type = 'auto'
}

function getContext(): AudioContext {
  if (!context) {
    setPlaybackSession()
    context = new AudioContext({ latencyHint: 'interactive' })
  }
  return context
}

export async function unlockAudio(): Promise<void> {
  setPlaybackSession()
  const ctx = getContext()
  if (ctx.state === 'suspended') await ctx.resume()
}

export async function releaseAudio(): Promise<void> {
  setIdleSession()
  if (context && context.state === 'running') await context.suspend()
}

function tone(freq: number, duration: number, gain = 0.08, type: OscillatorType = 'sine') {
  const ctx = getContext()
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  amp.gain.setValueAtTime(gain, ctx.currentTime)
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
  osc.connect(amp)
  amp.connect(ctx.destination)
  osc.onended = () => {
    osc.disconnect()
    amp.disconnect()
  }
  osc.start()
  osc.stop(ctx.currentTime + duration)
}

export function cueWork(): void {
  tone(880, 0.18, 0.09)
  window.setTimeout(() => tone(1174, 0.22, 0.1), 90)
  haptic('heavy')
}

export function cueRest(): void {
  tone(392, 0.28, 0.07)
  haptic('medium')
}

export function cueCountdown(): void {
  tone(660, 0.08, 0.05, 'triangle')
  haptic('light')
}

export function cueDone(): void {
  tone(523, 0.16)
  window.setTimeout(() => tone(659, 0.16), 140)
  window.setTimeout(() => tone(784, 0.32, 0.1), 280)
  haptic('success')
}
