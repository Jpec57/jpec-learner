// Thin wrapper around the Stockfish WASM build running in a Web Worker.
// The "lite-single" build is used because it needs no SharedArrayBuffer
// (so no COOP/COEP headers) and its network is ~7MB instead of ~110MB.
import stockfishJsUrl from "stockfish/bin/stockfish-18-lite-single.js?url";
import stockfishWasmUrl from "stockfish/bin/stockfish-18-lite-single.wasm?url";

import type { Score } from "@/features/chess/evaluation";

export interface PvLine {
  multipv: number;
  depth: number;
  // Score from the side to move's point of view, as Stockfish reports it.
  score: Score;
  pv: string[]; // UCI moves, e.g. "e2e4", "e7e8q"
}

export interface AnalysisResult {
  fen: string;
  depth: number;
  bestMove: string | null;
  lines: PvLine[]; // sorted by multipv (best first)
  cancelled: boolean;
}

interface Job {
  fen: string;
  go: string;
  multipv: number;
  onUpdate?: (partial: AnalysisResult) => void;
  resolve: (result: AnalysisResult) => void;
  lines: Map<number, PvLine>;
  depth: number;
  cancelled: boolean;
}

export interface StrengthOptions {
  skill?: number; // 0..20
  elo?: number; // 1320..3190, enables UCI_LimitStrength
}

function parseInfo(line: string): PvLine | null {
  const tokens = line.split(" ");
  if (tokens[0] !== "info" || !tokens.includes("pv") || !tokens.includes("score")) return null;
  let depth = 0;
  let multipv = 1;
  let score: Score | null = null;
  let pv: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "depth") depth = Number(tokens[++i]);
    else if (token === "multipv") multipv = Number(tokens[++i]);
    else if (token === "score") {
      const kind = tokens[++i];
      const value = Number(tokens[++i]);
      score = kind === "mate" ? { type: "mate", value } : { type: "cp", value };
    } else if (token === "pv") {
      pv = tokens.slice(i + 1);
      break;
    }
  }
  if (!score || pv.length === 0) return null;
  return { depth, multipv, score, pv };
}

export class StockfishEngine {
  private worker: Worker;
  private ready: Promise<void>;
  private queue: Job[] = [];
  private current: Job | null = null;
  private pendingOptions: string[] = [];

  constructor() {
    this.worker = new Worker(`${stockfishJsUrl}#${encodeURIComponent(stockfishWasmUrl)}`);
    this.ready = new Promise((resolve) => {
      const onBoot = (event: MessageEvent) => {
        if (event.data === "uciok") this.worker.postMessage("isready");
        if (event.data === "readyok") {
          this.worker.removeEventListener("message", onBoot);
          resolve();
        }
      };
      this.worker.addEventListener("message", onBoot);
    });
    this.worker.addEventListener("message", (event) => this.handleLine(String(event.data)));
    this.worker.postMessage("uci");
  }

  setStrength({ skill, elo }: StrengthOptions) {
    const options: string[] = [];
    if (elo) {
      options.push("setoption name UCI_LimitStrength value true", `setoption name UCI_Elo value ${elo}`);
      options.push("setoption name Skill Level value 20");
    } else {
      options.push("setoption name UCI_LimitStrength value false");
      options.push(`setoption name Skill Level value ${skill ?? 20}`);
    }
    // Options can only change between searches; they're flushed before the next job.
    this.pendingOptions.push(...options);
  }

  /** Queue a search. Jobs run one at a time, in order. */
  analyze(
    fen: string,
    { depth, movetime, multipv = 1 }: { depth?: number; movetime?: number; multipv?: number },
    onUpdate?: (partial: AnalysisResult) => void
  ): Promise<AnalysisResult> {
    const go = movetime ? `go movetime ${movetime}` : `go depth ${depth ?? 14}`;
    return new Promise((resolve) => {
      this.queue.push({ fen, go, multipv, onUpdate, resolve, lines: new Map(), depth: 0, cancelled: false });
      void this.pump();
    });
  }

  /** Stop the running search and drop queued ones; their promises resolve with cancelled=true. */
  cancelAll() {
    for (const job of this.queue) job.resolve(this.snapshot(job, null, true));
    this.queue = [];
    if (this.current) {
      this.current.cancelled = true;
      this.worker.postMessage("stop");
    }
  }

  destroy() {
    this.cancelAll();
    this.worker.terminate();
  }

  private async pump() {
    await this.ready;
    if (this.current || this.queue.length === 0) return;
    const job = this.queue.shift()!;
    this.current = job;
    for (const option of this.pendingOptions.splice(0)) this.worker.postMessage(option);
    this.worker.postMessage(`setoption name MultiPV value ${job.multipv}`);
    this.worker.postMessage(`position fen ${job.fen}`);
    this.worker.postMessage(job.go);
  }

  private snapshot(job: Job, bestMove: string | null, cancelled: boolean): AnalysisResult {
    const lines = [...job.lines.values()].sort((a, b) => a.multipv - b.multipv);
    return { fen: job.fen, depth: job.depth, bestMove: bestMove ?? lines[0]?.pv[0] ?? null, lines, cancelled };
  }

  private handleLine(line: string) {
    const job = this.current;
    if (!job) return;
    if (line.startsWith("info")) {
      const info = parseInfo(line);
      if (!info || info.multipv > job.multipv) return;
      // Ignore lower-bound/upper-bound noise from shallower depths overwriting deeper ones.
      const existing = job.lines.get(info.multipv);
      if (existing && existing.depth > info.depth) return;
      job.lines.set(info.multipv, info);
      if (info.multipv === 1) job.depth = info.depth;
      if (!job.cancelled) job.onUpdate?.(this.snapshot(job, null, false));
    } else if (line.startsWith("bestmove")) {
      const move = line.split(" ")[1];
      this.current = null;
      job.resolve(this.snapshot(job, move && move !== "(none)" ? move : null, job.cancelled));
      void this.pump();
    }
  }
}
