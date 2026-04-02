let audioContext: AudioContext | null = null

/**
 * Play a subtle notification beep for incoming messages.
 * Uses Web Audio API (no external sound files needed).
 */
export function playNotificationSound() {
  try {
    if (!audioContext) {
      audioContext = new AudioContext()
    }

    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1)

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.3)
  } catch {
    // Audio not available — silent fail
  }
}

/**
 * Request browser notification permission.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false

  const result = await Notification.requestPermission()
  return result === 'granted'
}

/**
 * Show a browser notification for a new message.
 */
export function showMessageNotification(contactName: string, preview: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if (document.hasFocus()) return // don't show if app is focused

  try {
    const notification = new Notification(contactName, {
      body: preview.slice(0, 100),
      icon: '/favicon.ico',
      tag: 'nexus-message', // replace previous notification
      silent: true, // we play our own sound
    })

    notification.onclick = () => {
      window.focus()
      notification.close()
    }

    // Auto-close after 5s
    setTimeout(() => notification.close(), 5000)
  } catch {
    // Notification not available
  }
}
