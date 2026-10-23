// Caches engine analyses per position and runs them one at a time.
// Callers "acquire" a position (the eval bar, a move review, ...) and release it
// when they no longer care; positions nobody wants any more are dropped from the
// queue so clicking quickly through a game never builds a backlog.
import type { AnalysisResult, StockfishEngine } from "@/features/chess/engine/stockfish";

type Listener = (result: AnalysisResult) => void;

interface Entry {
  refs: number;
  listeners: Set<Listener>;
  waiters: ((result: AnalysisResult) => void)[];
  partial?: AnalysisResult;
}

export class AnalysisService {
  private cache = new Map<string, AnalysisResult>();
  private entries = new Map<string, Entry>();
  private queue: string[] = [];
  private running: string | null = null;

  constructor(
    private engine: StockfishEngine,
    private depth = 14
  ) {}

  cached(fen: string): AnalysisResult | undefined {
    return this.cache.get(fen);
  }

  acquire(fen: string, onUpdate?: Listener): { promise: Promise<AnalysisResult>; release: () => void } {
    const hit = this.cache.get(fen);
    if (hit) {
      onUpdate?.(hit);
      return { promise: Promise.resolve(hit), release: () => {} };
    }
    let entry = this.entries.get(fen);
    if (!entry) {
      entry = { refs: 0, listeners: new Set(), waiters: [] };
      this.entries.set(fen, entry);
    }
    const current = entry;
    current.refs += 1;
    if (onUpdate) {
      current.listeners.add(onUpdate);
      if (current.partial) onUpdate(current.partial);
    }
    const promise = new Promise<AnalysisResult>((resolve) => current.waiters.push(resolve));
    if (this.running !== fen && !this.queue.includes(fen)) {
      this.queue.push(fen);
      this.pump();
    }

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      current.refs -= 1;
      if (onUpdate) current.listeners.delete(onUpdate);
      if (current.refs > 0 || this.cache.has(fen)) return;
      this.queue = this.queue.filter((queued) => queued !== fen);
      if (this.running === fen) this.engine.cancelAll();
      else this.entries.delete(fen);
    };
    return { promise, release };
  }

  /** Forget everything in flight (new game, take back, ...). Cached results stay valid. */
  reset() {
    this.queue = [];
    this.entries.clear();
    if (this.running) this.engine.cancelAll();
  }

  private pump() {
    if (this.running || this.queue.length === 0) return;
    const fen = this.queue.shift()!;
    this.running = fen;
    void this.engine
      .analyze(fen, { depth: this.depth }, (partial) => {
        const entry = this.entries.get(fen);
        if (!entry) return;
        entry.partial = partial;
        entry.listeners.forEach((listener) => listener(partial));
      })
      .then((result) => {
        this.running = null;
        const entry = this.entries.get(fen);
        if (!result.cancelled) {
          this.cache.set(fen, result);
          if (entry) {
            entry.listeners.forEach((listener) => listener(result));
            entry.waiters.forEach((resolve) => resolve(result));
          }
          this.entries.delete(fen);
        } else if (entry && entry.refs > 0) {
          this.queue.unshift(fen); // still wanted: try again
        } else {
          this.entries.delete(fen);
        }
        this.pump();
      });
  }
}
