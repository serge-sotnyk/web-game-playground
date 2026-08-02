import { describe, expect, it } from 'vitest'
import { DYING_SCROLL_MS, DYING_TO_RESULTS_MS, RESULTS_LOCK_MS } from './constants'
import { StateMachine } from './stateMachine'

function playing(): StateMachine {
  const machine = new StateMachine()
  machine.toReady()
  machine.tap()
  return machine
}

/** Crash, then run the clock forward until RESULTS. */
function toResults(machine: StateMachine): void {
  machine.crash()
  machine.advance(DYING_TO_RESULTS_MS)
}

describe('boot and ready', () => {
  it('starts in BOOT and needs no asset load to reach READY', () => {
    const machine = new StateMachine()
    expect(machine.state).toBe('BOOT')
    expect(machine.tap()).toBe('IGNORE')

    machine.toReady()
    expect(machine.state).toBe('READY')
  })

  it('starts a run on the first tap', () => {
    const machine = new StateMachine()
    machine.toReady()
    expect(machine.tap()).toBe('START_RUN')
    expect(machine.state).toBe('PLAYING')
  })
})

describe('playing', () => {
  it('turns taps into flips', () => {
    const machine = playing()
    expect(machine.tap()).toBe('FLIP')
    expect(machine.tap()).toBe('FLIP')
    expect(machine.state).toBe('PLAYING')
  })
})

describe('dying', () => {
  it('enters DYING on the first collision and ignores later ones', () => {
    const machine = playing()
    expect(machine.crash()).toBe(true)
    expect(machine.state).toBe('DYING')
    expect(machine.crash()).toBe(false)
  })

  it('swallows taps while dying', () => {
    const machine = playing()
    machine.crash()
    expect(machine.tap()).toBe('IGNORE')
  })

  it('decays the world scroll to zero over 250 ms', () => {
    const machine = playing()
    machine.crash()
    expect(machine.scrollFactor()).toBe(1)

    machine.advance(DYING_SCROLL_MS / 2)
    expect(machine.scrollFactor()).toBeCloseTo(0.5, 10)

    machine.advance(DYING_SCROLL_MS / 2)
    expect(machine.scrollFactor()).toBe(0)

    machine.advance(1000)
    expect(machine.scrollFactor()).toBe(0)
  })

  it('reaches RESULTS at 650 ms, not before', () => {
    const machine = playing()
    machine.crash()

    machine.advance(DYING_TO_RESULTS_MS - 1)
    expect(machine.state).toBe('DYING')

    machine.advance(1)
    expect(machine.state).toBe('RESULTS')
  })
})

describe('results', () => {
  it('locks retry for the first 350 ms', () => {
    const machine = playing()
    toResults(machine)

    machine.advance(RESULTS_LOCK_MS - 1)
    expect(machine.tap()).toBe('IGNORE')
    expect(machine.state).toBe('RESULTS')
  })

  it('retries on a single tap once unlocked, going straight to PLAYING', () => {
    const machine = playing()
    toResults(machine)
    machine.advance(RESULTS_LOCK_MS)

    expect(machine.tap()).toBe('START_RUN')
    expect(machine.state).toBe('PLAYING')
  })

  it('does not carry the lockout into the next results screen', () => {
    const machine = playing()
    toResults(machine)
    machine.advance(RESULTS_LOCK_MS)
    machine.tap()

    toResults(machine)
    expect(machine.tap()).toBe('IGNORE')
  })
})

describe('pausing', () => {
  it('pauses a run and resumes without flipping', () => {
    const machine = playing()
    expect(machine.pause()).toBe(true)
    expect(machine.state).toBe('PAUSED')

    expect(machine.tap()).toBe('RESUME')
    expect(machine.state).toBe('PLAYING')
  })

  it('only pauses an actual run', () => {
    const machine = new StateMachine()
    machine.toReady()
    expect(machine.pause()).toBe(false)
    expect(machine.state).toBe('READY')

    machine.tap()
    toResults(machine)
    expect(machine.pause()).toBe(false)
    expect(machine.state).toBe('RESULTS')
  })
})

describe('landscape', () => {
  it('pauses play and swallows every tap while blocked', () => {
    const machine = playing()
    expect(machine.setLandscape(true)).toBe(true)
    expect(machine.state).toBe('PAUSED')
    expect(machine.isBlocked).toBe(true)
    expect(machine.tap()).toBe('IGNORE')
  })

  it('leaves the run paused on returning to portrait, awaiting a deliberate tap', () => {
    const machine = playing()
    machine.setLandscape(true)
    expect(machine.setLandscape(false)).toBe(false)

    expect(machine.state).toBe('PAUSED')
    expect(machine.tap()).toBe('RESUME')
    expect(machine.state).toBe('PLAYING')
  })

  it('blocks the ready screen without changing its state', () => {
    const machine = new StateMachine()
    machine.toReady()
    expect(machine.setLandscape(true)).toBe(false)
    expect(machine.state).toBe('READY')
    expect(machine.tap()).toBe('IGNORE')

    machine.setLandscape(false)
    expect(machine.tap()).toBe('START_RUN')
  })
})
