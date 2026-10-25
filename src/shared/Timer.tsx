import { useEffect, useRef, useState } from 'react'
import { formatDuration } from '@/domain/nutrition'
import { NumberField } from '@/shared/forms'
import { Button } from './ui'

function playBeep(ctx: AudioContext) {
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = 880
  gain.gain.value = 0.08
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
  osc.stop(now + 0.35)

  const osc2 = ctx.createOscillator()
  const gain2 = ctx.createGain()
  osc2.type = 'sine'
  osc2.frequency.value = 660
  gain2.gain.value = 0.08
  osc2.connect(gain2)
  gain2.connect(ctx.destination)
  osc2.start(now + 0.4)
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
  osc2.stop(now + 0.8)
}

function clampSeconds(total: number): number {
  return Math.max(0, Math.round(total))
}

export function CookTimer({
  presetSeconds,
}: {
  presetSeconds: number
}) {
  const [remaining, setRemaining] = useState(presetSeconds)
  const [running, setRunning] = useState(false)
  const [alarm, setAlarm] = useState(false)
  const intervalRef = useRef<number | null>(null)
  const alarmCtxRef = useRef<AudioContext | null>(null)

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
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
    }
  }, [running])

  useEffect(() => {
    if (!alarm) {
      if (alarmCtxRef.current) {
        void alarmCtxRef.current.close().catch(() => undefined)
        alarmCtxRef.current = null
      }
      return
    }

    let cancelled = false
    let intervalId: number | null = null

    async function startLoop() {
      try {
        const ctx = new AudioContext()
        alarmCtxRef.current = ctx
        if (ctx.state === 'suspended') await ctx.resume()
        if (cancelled) {
          void ctx.close()
          return
        }
        playBeep(ctx)
        intervalId = window.setInterval(() => {
          if (cancelled || ctx.state === 'closed') return
          try {
            playBeep(ctx)
          } catch {
            /* ignore */
          }
        }, 1100)
      } catch {
        // Audio may be blocked
      }
    }

    void startLoop()

    return () => {
      cancelled = true
      if (intervalId != null) window.clearInterval(intervalId)
      if (alarmCtxRef.current) {
        void alarmCtxRef.current.close().catch(() => undefined)
        alarmCtxRef.current = null
      }
    }
  }, [alarm])

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60

  function setFromParts(nextMin: number, nextSec: number) {
    const m = Math.max(0, Math.floor(nextMin) || 0)
    const s = Math.max(0, Math.min(59, Math.floor(nextSec) || 0))
    setRemaining(clampSeconds(m * 60 + s))
    setAlarm(false)
  }

  function stopAlarm() {
    setAlarm(false)
  }

  return (
    <div
      className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 ${
        running ? 'timer-active' : ''
      } ${alarm ? 'border-warn bg-warn/10' : ''}`}
    >
      {running ? (
        <div className="font-display text-lg tabular-nums text-ink">
          {formatDuration(remaining)}
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-1">
          <div className="w-28">
            <NumberField
              value={minutes}
              min={0}
              step={1}
              inputMode="numeric"
              onChange={(m) => setFromParts(m, seconds)}
            />
          </div>
          <span className="font-display text-lg text-ink">:</span>
          <div className="w-28">
            <NumberField
              value={seconds}
              min={0}
              max={59}
              step={1}
              inputMode="numeric"
              onChange={(s) => setFromParts(minutes, s)}
            />
          </div>
        </div>
      )}
      <div className="ml-auto flex flex-wrap justify-end gap-1">
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
            stopAlarm()
          }}
        >
          Reset
        </Button>
        {alarm ? (
          <Button variant="primary" className="!py-1 !text-xs" onClick={stopAlarm}>
            Stop alarm
          </Button>
        ) : null}
      </div>
    </div>
  )
}
