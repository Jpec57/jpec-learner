import { useEffect, useRef, useState } from "react";

import { AnalysisService } from "@/features/chess/engine/analysisService";
import { StockfishEngine, type AnalysisResult } from "@/features/chess/engine/stockfish";

/** One analysis engine for the lifetime of the page. */
export function useAnalysisService(depth = 14): AnalysisService | null {
  const [service, setService] = useState<AnalysisService | null>(null);
  useEffect(() => {
    const engine = new StockfishEngine();
    setService(new AnalysisService(engine, depth));
    return () => engine.destroy();
  }, [depth]);
  return service;
}

/** One engine used to pick the computer's moves. */
export function useOpponentEngine(): StockfishEngine | null {
  const [engine, setEngine] = useState<StockfishEngine | null>(null);
  useEffect(() => {
    const instance = new StockfishEngine();
    setEngine(instance);
    return () => instance.destroy();
  }, []);
  return engine;
}

/** Live (deepening) analysis of `fen`, for the eval bar. */
export function useLiveAnalysis(service: AnalysisService | null, fen: string | null): AnalysisResult | null {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const fenRef = useRef(fen);
  fenRef.current = fen;
  useEffect(() => {
    if (!service || !fen) return;
    setResult(service.cached(fen) ?? null);
    const { release } = service.acquire(fen, (update) => {
      if (fenRef.current === fen) setResult(update);
    });
    return release;
  }, [service, fen]);
  return result && result.fen === fen ? result : null;
}

/** True once any of the given engines failed to start or crashed. */
export function useEngineFailed(...engines: (StockfishEngine | null | undefined)[]): boolean {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    const unsubscribes = engines.map((engine) => engine?.onFailure(() => setFailed(true)));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, engines);
  return failed;
}
