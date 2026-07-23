import { useEffect, useRef, useState } from 'react'
import { formatDuration } from '@/domain/nutrition'
import { Button } from './ui'

function playAlarm() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.value = 0.08
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    const stopAt = ctx.currentTime + 0.35
    gain.gain.exponentialRampToValueAtTime(0.001, stopAt)
    osc.stop(stopAt)
    setTimeout(() => {
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.frequency.value = 660
      gain2.gain.value = 0.08
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start()
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc2.stop(ctx.currentTime + 0.4)
    }, 400)
  } catch {
    // Audio may be blocked
  }
}

export function CookTimer({
  presetSeconds,
  label,
}: {
  presetSeconds: number
  label?: string
}) {
  const [remaining, setRemaining] = useState(presetSeconds)
  const [running, setRunning] = useState(false)
  const [alarm, setAlarm] = useState(false)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    setRemaining(presetSeconds)
    setRunning(false)
    setAlarm(false)
  }, [presetSeconds])

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false)
          setAlarm(true)
          playAlarm()
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
    }
  }, [running])

  return (
    <div
      className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 ${
        running ? 'timer-active' : ''
      } ${alarm ? 'border-warn bg-warn/10' : ''}`}
    >
      <div className="font-display text-lg tabular-nums text-accent-deep">
        {formatDuration(remaining)}
      </div>
      {label ? <span className="text-xs text-ink-muted">{label}</span> : null}
      <div className="ml-auto flex gap-1">
        {!running ? (
          <Button
            variant="secondary"
            className="!py-1 !text-xs"
            onClick={() => {
              if (remaining === 0) setRemaining(presetSeconds)
              setAlarm(false)
              setRunning(true)
            }}
          >
            Start
          </Button>
        ) : (
          <Button variant="secondary" className="!py-1 !text-xs" onClick={() => setRunning(false)}>
            Pause
          </Button>
        )}
        <Button
          variant="ghost"
          className="!py-1 !text-xs"
          onClick={() => {
            setRunning(false)
            setRemaining(presetSeconds)
            setAlarm(false)
          }}
        >
          Reset
        </Button>
        {alarm ? (
          <Button variant="primary" className="!py-1 !text-xs" onClick={() => setAlarm(false)}>
            Dismiss
          </Button>
        ) : null}
      </div>
    </div>
  )
}
