import { WebHaptics } from 'web-haptics'

const haptics = new WebHaptics()

export type HapticKind =
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'nudge'
  | 'warning'

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

let switchLabel: HTMLLabelElement | undefined

function ensureSwitch(): HTMLLabelElement {
  if (switchLabel?.isConnected) return switchLabel

  const id = 'kb-haptic-switch'
  const label = document.createElement('label')
  label.htmlFor = id
  label.className = 'haptic-switch'
  label.setAttribute('aria-hidden', 'true')

  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.id = id
  input.tabIndex = -1
  input.style.all = 'initial'
  input.style.appearance = 'auto'

  label.appendChild(input)
  document.body.appendChild(label)
  switchLabel = label
  return label
}

function pulseSwitch(): void {
  ensureSwitch().click()
}

export function haptic(kind: HapticKind = 'medium'): void {
  if (isIOS()) {
    pulseSwitch()
    if (kind === 'success' || kind === 'heavy' || kind === 'nudge') {
      window.setTimeout(pulseSwitch, 70)
    }
    if (kind === 'success') window.setTimeout(pulseSwitch, 140)
    return
  }
  void haptics.trigger(kind)
}

function isTappable(el: Element): boolean {
  if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
    return !el.disabled
  }
  return true
}

export function installTapFeedback(): void {
  ensureSwitch()
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const tappable = target.closest(
        'button, a, [role="radio"], input, label, summary, [role="button"]',
      )
      if (!tappable || !isTappable(tappable)) return
      if (isIOS()) pulseSwitch()
      else void haptics.trigger('medium')
    },
    { capture: true, passive: true },
  )
}
