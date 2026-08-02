import {
  DRIFT_MAX,
  DRIFT_PERIOD_SECONDS,
  DRIFT_SCORE_DELTA,
  DRIFT_START_SCORE,
  DYING_DURATION_MS,
  FIXED_STEP,
  FLIP_DEBOUNCE_MS,
  FLIP_IMPULSE,
  GATE_CENTER_OFFSET,
  GATE_EDGE_CLEARANCE,
  GATE_GAP_MIN,
  GATE_GAP_SCORE_DELTA,
  GATE_GAP_START,
  GATE_MIN_CENTER_CHANGE,
  GATE_REMOVE_MARGIN,
  GATE_SPACING,
  GATE_SPAWN_MARGIN,
  GATE_SPEED_MAX,
  GATE_SPEED_SCORE_DELTA,
  GATE_SPEED_START,
  GATE_VISUAL_WIDTH,
  MAX_FRAME_SECONDS,
  MAX_STEPS_PER_FRAME,
  PLAYER_ACCELERATION,
  PLAYER_MAX_SPEED,
  RETRY_LOCK_MS,
  TAU,
  clamp,
  lerp,
} from './constants';
import { corridorCollision, gateCollision } from './collision';
import { createMulberry32, randomRange, randomSign } from './rng';
import type {
  FrameAdvance,
  GameSession,
  GateState,
  Layout,
  RenderSnapshot,
  RunState,
  SimulationEvent,
} from './types';

export const gapHeightForScore = (score: number, U = 1): number =>
  Math.max(GATE_GAP_MIN * U, (GATE_GAP_START - score * GATE_GAP_SCORE_DELTA) * U);

export const speedForScore = (score: number, U = 1): number =>
  Math.min(GATE_SPEED_MAX * U, (GATE_SPEED_START + score * GATE_SPEED_SCORE_DELTA) * U);

export const driftAmplitudeForScore = (score: number, U = 1): number =>
  score < DRIFT_START_SCORE
    ? 0
    : Math.min(DRIFT_MAX * U, (score - (DRIFT_START_SCORE - 1)) * DRIFT_SCORE_DELTA * U);

export const spawnIntervalForScore = (score: number, U = 1): number =>
  (GATE_SPACING * U) / speedForScore(score, U);

export const gateCenterAt = (gate: GateState, age = gate.age): number =>
  gate.baseCenter +
  gate.amplitude * Math.sin((TAU * age) / DRIFT_PERIOD_SECONDS + gate.phase);

const makeFirstGate = (layout: Layout): GateState => {
  const center = (layout.playTop + layout.playBottom) / 2;
  const x = layout.width + GATE_SPAWN_MARGIN * layout.U;
  return {
    id: 0,
    x,
    previousX: x,
    age: 0,
    gapHeight: gapHeightForScore(0, layout.U),
    baseCenter: center,
    amplitude: 0,
    phase: 0,
    previousCenter: center,
    scored: false,
  };
};

const legalGateCenter = (
  previousCenter: number,
  gapHeight: number,
  amplitude: number,
  layout: Layout,
  run: RunState,
): { center: number; phase: number } => {
  const clearance = GATE_EDGE_CLEARANCE * layout.U;
  const lower = layout.playTop + gapHeight / 2 + clearance + amplitude;
  const upper = layout.playBottom - gapHeight / 2 - clearance - amplitude;
  const safeLower = Math.min(lower, upper);
  const safeUpper = Math.max(lower, upper);
  const offset = randomRange(
    run.rng,
    -GATE_CENTER_OFFSET * layout.U,
    GATE_CENTER_OFFSET * layout.U,
  );
  const original = clamp(previousCenter + offset, safeLower, safeUpper);
  const minimumChange = GATE_MIN_CENTER_CHANGE * layout.U;
  let center = original;

  if (Math.abs(center - previousCenter) < minimumChange) {
    const firstSign = offset === 0 ? randomSign(run.rng) : offset < 0 ? -1 : 1;
    const firstTry = clamp(previousCenter + firstSign * minimumChange, safeLower, safeUpper);
    if (Math.abs(firstTry - previousCenter) >= minimumChange) {
      center = firstTry;
    } else {
      const otherTry = clamp(previousCenter - firstSign * minimumChange, safeLower, safeUpper);
      if (Math.abs(otherTry - previousCenter) >= minimumChange) center = otherTry;
    }
  }

  return { center, phase: randomRange(run.rng, 0, TAU) };
};

const spawnGate = (run: RunState, x: number): GateState => {
  const { layout, score } = run;
  const previous = run.gates.reduce<GateState | null>(
    (rightmost, gate) => (!rightmost || gate.x > rightmost.x ? gate : rightmost),
    null,
  );
  const previousCenter = previous?.baseCenter ?? (layout.playTop + layout.playBottom) / 2;
  const gapHeight = gapHeightForScore(score, layout.U);
  const amplitude = driftAmplitudeForScore(score, layout.U);
  const selected = legalGateCenter(previousCenter, gapHeight, amplitude, layout, run);
  const gate: GateState = {
    id: run.nextGateId,
    x,
    previousX: x,
    age: 0,
    gapHeight,
    baseCenter: selected.center,
    amplitude,
    phase: selected.phase,
    previousCenter: selected.center + amplitude * Math.sin(selected.phase),
    scored: false,
  };
  run.nextGateId += 1;
  run.gates.push(gate);
  return gate;
};

export const createRun = (
  layout: Layout,
  seed: number,
): { run: RunState; events: SimulationEvent[] } => {
  const firstGate = makeFirstGate(layout);
  const run: RunState = {
    layout,
    player: {
      y: (layout.playTop + layout.playBottom) / 2,
      previousY: (layout.playTop + layout.playBottom) / 2,
      velocityY: 0,
      direction: 1,
      pendingFlip: false,
      lastAcceptedFlipMs: Number.NEGATIVE_INFINITY,
    },
    gates: [firstGate],
    score: 0,
    worldDistance: 0,
    nextGateId: 1,
    rng: createMulberry32(seed),
    crashed: false,
  };
  return { run, events: [{ type: 'GATE_SPAWNED', gateId: firstGate.id }] };
};

export const requestFlip = (run: RunState, atMs: number): boolean => {
  if (
    run.crashed ||
    run.player.pendingFlip ||
    atMs - run.player.lastAcceptedFlipMs < FLIP_DEBOUNCE_MS
  ) {
    return false;
  }
  run.player.pendingFlip = true;
  run.player.lastAcceptedFlipMs = atMs;
  return true;
};

export const consumeQueuedFlip = (run: RunState): SimulationEvent | null => {
  const { player } = run;
  if (!player.pendingFlip || run.crashed) return null;
  player.pendingFlip = false;
  player.direction = player.direction === 1 ? -1 : 1;
  player.velocityY = clamp(
    player.velocityY + player.direction * FLIP_IMPULSE * run.layout.U,
    -PLAYER_MAX_SPEED * run.layout.U,
    PLAYER_MAX_SPEED * run.layout.U,
  );
  return { type: 'FLIPPED', direction: player.direction };
};

export const stepSimulation = (run: RunState, dt = FIXED_STEP): SimulationEvent[] => {
  if (run.crashed) return [];
  const { layout, player } = run;
  const U = layout.U;
  const events: SimulationEvent[] = [];

  player.previousY = player.y;
  const flipEvent = consumeQueuedFlip(run);
  if (flipEvent) events.push(flipEvent);

  player.velocityY = clamp(
    player.velocityY + player.direction * PLAYER_ACCELERATION * U * dt,
    -PLAYER_MAX_SPEED * U,
    PLAYER_MAX_SPEED * U,
  );
  player.y += player.velocityY * dt;

  const scoreAtStepStart = run.score;
  const speed = speedForScore(scoreAtStepStart, U);
  run.worldDistance += speed * dt;
  for (const gate of run.gates) {
    gate.previousX = gate.x;
    gate.previousCenter = gateCenterAt(gate);
    gate.x -= speed * dt;
    gate.age += dt;
  }

  const hitGate = run.gates.some((gate) =>
    gateCollision(player, gate, gateCenterAt(gate), layout),
  );
  if (corridorCollision(player, layout) || hitGate) {
    run.crashed = true;
    return [{ type: 'CRASHED', score: run.score }];
  }

  const visualHalfWidth = (GATE_VISUAL_WIDTH * U) / 2;
  for (const gate of run.gates) {
    if (!gate.scored && gate.x + visualHalfWidth < layout.playerX) {
      gate.scored = true;
      run.score += 1;
      events.push({ type: 'SCORED', gateId: gate.id, score: run.score });
    }
  }

  run.gates = run.gates.filter(
    (gate) => gate.x + visualHalfWidth >= -GATE_REMOVE_MARGIN * U,
  );

  const spawnX = layout.width + GATE_SPAWN_MARGIN * U;
  const spacing = GATE_SPACING * U;
  let rightmost = run.gates.reduce<GateState | null>(
    (candidate, gate) => (!candidate || gate.x > candidate.x ? gate : candidate),
    null,
  );
  if (!rightmost) {
    const spawned = spawnGate(run, spawnX);
    events.push({ type: 'GATE_SPAWNED', gateId: spawned.id });
    rightmost = spawned;
  }
  while (rightmost.x <= spawnX - spacing) {
    const spawned = spawnGate(run, rightmost.x + spacing);
    events.push({ type: 'GATE_SPAWNED', gateId: spawned.id });
    rightmost = spawned;
  }

  return events;
};

export const advanceSimulationFrame = (
  run: RunState,
  accumulator: number,
  frameSeconds: number,
): FrameAdvance => {
  let nextAccumulator = accumulator + Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS);
  const events: SimulationEvent[] = [];
  let steps = 0;
  while (nextAccumulator + Number.EPSILON >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
    events.push(...stepSimulation(run));
    nextAccumulator -= FIXED_STEP;
    steps += 1;
    if (run.crashed) break;
  }
  return {
    accumulator: Math.max(0, nextAccumulator),
    interpolation: clamp(nextAccumulator / FIXED_STEP, 0, 1),
    events,
    steps,
  };
};

export const renderSnapshot = (run: RunState, interpolation: number): RenderSnapshot => ({
  playerY: lerp(run.player.previousY, run.player.y, interpolation),
  playerVelocityY: run.player.velocityY,
  direction: run.player.direction,
  gates: run.gates.map((gate) => ({
    id: gate.id,
    x: lerp(gate.previousX, gate.x, interpolation),
    center: lerp(gate.previousCenter, gateCenterAt(gate), interpolation),
    gapHeight: gate.gapHeight,
  })),
  score: run.score,
  worldDistance: run.worldDistance,
});

export const createGameSession = (): GameSession => ({
  phase: 'BOOT',
  phaseElapsedMs: 0,
  accumulator: 0,
  run: null,
  landscapeBlocked: false,
  newBest: false,
});

export const finishBoot = (session: GameSession): void => {
  if (session.phase === 'BOOT') session.phase = 'READY';
};

const startRun = (
  session: GameSession,
  layout: Layout,
  seed: number,
  atMs: number,
): SimulationEvent[] => {
  const created = createRun(layout, seed);
  session.run = created.run;
  session.phase = 'PLAYING';
  session.phaseElapsedMs = 0;
  session.accumulator = 0;
  session.newBest = false;
  requestFlip(created.run, atMs);
  return created.events;
};

export const primaryAction = (
  session: GameSession,
  layout: Layout,
  seed: number,
  atMs: number,
): SimulationEvent[] => {
  if (session.landscapeBlocked) return [];
  switch (session.phase) {
    case 'READY':
      return startRun(session, layout, seed, atMs);
    case 'PLAYING':
      if (session.run) requestFlip(session.run, atMs);
      return [];
    case 'PAUSED':
      session.phase = 'PLAYING';
      session.phaseElapsedMs = 0;
      session.accumulator = 0;
      return [];
    case 'RESULTS':
      return session.phaseElapsedMs >= RETRY_LOCK_MS
        ? startRun(session, layout, seed, atMs)
        : [];
    case 'BOOT':
    case 'DYING':
      return [];
  }
};

export const advanceGameSession = (
  session: GameSession,
  frameSeconds: number,
): SimulationEvent[] => {
  if (session.landscapeBlocked) return [];
  const elapsedMs = Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS) * 1000;
  if (session.phase === 'PLAYING' && session.run) {
    const advanced = advanceSimulationFrame(session.run, session.accumulator, frameSeconds);
    session.accumulator = advanced.accumulator;
    if (advanced.events.some((event) => event.type === 'CRASHED')) {
      session.phase = 'DYING';
      session.phaseElapsedMs = 0;
      session.accumulator = 0;
    }
    return advanced.events;
  }
  if (session.phase === 'DYING') {
    session.phaseElapsedMs += elapsedMs;
    if (session.phaseElapsedMs >= DYING_DURATION_MS) {
      session.phase = 'RESULTS';
      session.phaseElapsedMs = 0;
    }
  } else if (session.phase === 'RESULTS') {
    session.phaseElapsedMs += elapsedMs;
  }
  return [];
};

export const pauseGame = (session: GameSession): void => {
  if (session.phase !== 'PLAYING') return;
  session.phase = 'PAUSED';
  session.phaseElapsedMs = 0;
  session.accumulator = 0;
};

export const setLandscapeBlocked = (session: GameSession, blocked: boolean): void => {
  if (blocked && !session.landscapeBlocked) pauseGame(session);
  session.landscapeBlocked = blocked;
  session.accumulator = 0;
};
