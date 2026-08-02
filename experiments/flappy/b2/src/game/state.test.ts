import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from './constants';
import { calculateLayout } from './layout';
import {
  advanceGameSession,
  createGameSession,
  finishBoot,
  pauseGame,
  primaryAction,
  setLandscapeBlocked,
} from './simulation';

const layout = calculateLayout(360, 800, { top: 0, right: 0, bottom: 0, left: 0 });

describe('game state machine', () => {
  it('starts from READY with an upward flip', () => {
    const session = createGameSession();
    expect(session.phase).toBe('BOOT');
    finishBoot(session);
    expect(session.phase).toBe('READY');
    primaryAction(session, layout, 1, 0);
    expect(session.phase).toBe('PLAYING');
    const events = advanceGameSession(session, FIXED_STEP);
    expect(events.some((event) => event.type === 'FLIPPED' && event.direction === -1)).toBe(true);
  });

  it('goes through DYING, RESULTS lockout, and single-tap retry', () => {
    const session = createGameSession();
    finishBoot(session);
    primaryAction(session, layout, 1, 0);
    advanceGameSession(session, FIXED_STEP);
    session.run!.player.y = layout.playTop + 8;
    session.run!.player.previousY = session.run!.player.y;
    expect(advanceGameSession(session, FIXED_STEP)).toEqual([{ type: 'CRASHED', score: 0 }]);
    expect(session.phase).toBe('DYING');
    for (let frame = 0; frame < 13; frame += 1) advanceGameSession(session, 0.05);
    expect(session.phase).toBe('RESULTS');
    primaryAction(session, layout, 2, 1000);
    expect(session.phase).toBe('RESULTS');
    for (let frame = 0; frame < 7; frame += 1) advanceGameSession(session, 0.05);
    primaryAction(session, layout, 2, 1400);
    expect(session.phase).toBe('PLAYING');
    expect(session.run!.player.pendingFlip).toBe(true);
  });

  it('pauses on visibility and resumes without flipping', () => {
    const session = createGameSession();
    finishBoot(session);
    primaryAction(session, layout, 1, 0);
    advanceGameSession(session, FIXED_STEP);
    const direction = session.run!.player.direction;
    pauseGame(session);
    expect(session.phase).toBe('PAUSED');
    primaryAction(session, layout, 2, 100);
    expect(session.phase).toBe('PLAYING');
    expect(session.run!.player.direction).toBe(direction);
    expect(session.run!.player.pendingFlip).toBe(false);
  });

  it('requires a deliberate resume tap after landscape', () => {
    const session = createGameSession();
    finishBoot(session);
    primaryAction(session, layout, 1, 0);
    advanceGameSession(session, FIXED_STEP);
    setLandscapeBlocked(session, true);
    expect(session.phase).toBe('PAUSED');
    primaryAction(session, layout, 2, 100);
    expect(session.phase).toBe('PAUSED');
    setLandscapeBlocked(session, false);
    expect(session.phase).toBe('PAUSED');
    primaryAction(session, layout, 2, 200);
    expect(session.phase).toBe('PLAYING');
    expect(session.run!.player.pendingFlip).toBe(false);
  });
});
