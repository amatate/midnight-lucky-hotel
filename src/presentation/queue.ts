import type { GameEvent } from "@/core/events";

export interface PresentationMetadata {
  readonly delayMs: number;
}

export interface PresentationQueueOptions {
  readonly delay?: number;
  readonly reducedMotion?: boolean;
  readonly onEvent?: (event: GameEvent, metadata: PresentationMetadata) => void;
}

export interface PresentationQueue {
  readonly done: boolean;
  next(): GameEvent | null;
  speedUp(): void;
  skip(): readonly GameEvent[];
}

const FAST_DELAY_MS = 50;

export function createPresentationQueue(
  events: readonly GameEvent[],
  options: PresentationQueueOptions = {}
): PresentationQueue {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  let cursor = 0;
  let delayMs = options.reducedMotion ? 0 : Math.max(0, options.delay ?? 350);

  return {
    get done() {
      return cursor >= ordered.length;
    },
    next() {
      const event = ordered[cursor];
      if (event === undefined) return null;
      cursor += 1;
      options.onEvent?.(event, { delayMs });
      return event;
    },
    speedUp() {
      delayMs = options.reducedMotion ? 0 : Math.min(delayMs, FAST_DELAY_MS);
    },
    skip() {
      const remaining = ordered.slice(cursor);
      cursor = ordered.length;
      return remaining;
    }
  };
}
