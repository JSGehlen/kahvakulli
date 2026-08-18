let context: AudioContext | undefined

function getContext(): AudioContext {
  if (!context) context = new AudioContext()
  return context
}

export async function unlockAudio(): Promise<void> {
  const ctx = getContext()
  if (ctx.state === 'suspended') await ctx.resume()
}

function tone(freq: number, duration: number, gain = 0.08, type: OscillatorType = 'sine') {
  const ctx = getContext()
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  amp.gain.value = gain
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
  osc.connect(amp)
  amp.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + duration)
}

export function cueWork(): void {
  tone(880, 0.18, 0.09)
  window.setTimeout(() => tone(1174, 0.22, 0.1), 90)
  vibrate([40, 30, 80])
}

export function cueRest(): void {
  tone(392, 0.28, 0.07)
  vibrate(40)
}

export function cueCountdown(): void {
  tone(660, 0.08, 0.05, 'triangle')
}

export function cueDone(): void {
  tone(523, 0.16)
  window.setTimeout(() => tone(659, 0.16), 140)
  window.setTimeout(() => tone(784, 0.32, 0.1), 280)
  vibrate([80, 60, 80, 60, 160])
}

function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Some browsers expose vibrate but reject it.
  }
}
