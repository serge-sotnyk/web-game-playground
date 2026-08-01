import type { GameEvent } from './types';

type EventType = GameEvent['type'];
type EventFor<T extends EventType> = Extract<GameEvent, { type: T }>;
type Listener<T extends EventType> = (event: EventFor<T>) => void;

class EventBus {
  private readonly listeners = new Map<EventType, Set<(event: GameEvent) => void>>();

  on<T extends EventType>(type: T, listener: Listener<T>): void {
    const set = this.listeners.get(type) ?? new Set<(event: GameEvent) => void>();
    set.add(listener as (event: GameEvent) => void);
    this.listeners.set(type, set);
  }

  off<T extends EventType>(type: T, listener: Listener<T>): void {
    this.listeners.get(type)?.delete(listener as (event: GameEvent) => void);
  }

  emit(event: GameEvent): void {
    this.listeners.get(event.type)?.forEach((listener) => listener(event));
  }
}

export const bus = new EventBus();
