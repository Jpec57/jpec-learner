// Opening-course progress, saved on the user's account.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { api } from "@/lib/api";

export interface LineProgress {
  completed: number; // times finished
  flawless: number; // times finished without a wrong move
}

export type ProgressMap = Record<string, LineProgress>; // key: `${courseId}/${lineId}`

interface LineProgressRow extends LineProgress {
  course_id: string;
  line_id: string;
}

const QUERY_KEY = ["chess-progress"];
// Progress used to live in the browser only; it is moved to the account once.
const LEGACY_KEY = "jpeclearner.chess.progress";

const keyOf = (courseId: string, lineId: string) => `${courseId}/${lineId}`;

function toMap(rows: LineProgressRow[]): ProgressMap {
  return Object.fromEntries(rows.map((row) => [keyOf(row.course_id, row.line_id), { completed: row.completed, flawless: row.flawless }]));
}

function readLegacy(): LineProgressRow[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw) as ProgressMap;
    return Object.entries(map).flatMap(([key, value]) => {
      const [course_id, line_id] = key.split("/");
      return course_id && line_id && value?.completed > 0
        ? [{ course_id, line_id, completed: value.completed, flawless: value.flawless ?? 0 }]
        : [];
    });
  } catch {
    return [];
  }
}

async function fetchProgress(): Promise<ProgressMap> {
  const legacy = readLegacy();
  if (legacy.length > 0) {
    const { data } = await api.post<LineProgressRow[]>("/chess/progress/import", { lines: legacy });
    try {
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      // Storage unavailable: nothing left to clean up.
    }
    return toMap(data);
  }
  const { data } = await api.get<LineProgressRow[]>("/chess/progress");
  return toMap(data);
}

export function useChessProgress() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: fetchProgress, staleTime: 60_000 });

  const recordMutation = useMutation({
    mutationFn: async (input: { courseId: string; lineId: string; flawless: boolean }) => {
      const { data } = await api.post<LineProgressRow[]>("/chess/progress", {
        course_id: input.courseId,
        line_id: input.lineId,
        flawless: input.flawless,
      });
      return toMap(data);
    },
    // Show the result straight away; the server's answer then replaces it.
    onMutate: ({ courseId, lineId, flawless }) => {
      queryClient.setQueryData<ProgressMap>(QUERY_KEY, (current = {}) => {
        const key = keyOf(courseId, lineId);
        const line = current[key] ?? { completed: 0, flawless: 0 };
        return { ...current, [key]: { completed: line.completed + 1, flawless: line.flawless + (flawless ? 1 : 0) } };
      });
    },
    onSuccess: (map) => queryClient.setQueryData(QUERY_KEY, map),
    onError: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const resetMutation = useMutation({
    mutationFn: async (courseId?: string) => {
      await api.delete("/chess/progress", { params: courseId ? { course_id: courseId } : undefined });
    },
    onMutate: (courseId) => {
      queryClient.setQueryData<ProgressMap>(QUERY_KEY, (current = {}) =>
        courseId ? Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${courseId}/`))) : {}
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const { mutate: recordMutate } = recordMutation;
  const { mutate: resetMutate } = resetMutation;
  const record = useCallback(
    (courseId: string, lineId: string, flawless: boolean) => recordMutate({ courseId, lineId, flawless }),
    [recordMutate]
  );
  const reset = useCallback((courseId?: string) => resetMutate(courseId), [resetMutate]);

  return {
    progress: query.data ?? {},
    loading: query.isLoading,
    saveFailed: recordMutation.isError,
    record,
    reset,
  };
}

export function lineProgress(progress: ProgressMap, courseId: string, lineId: string): LineProgress {
  return progress[keyOf(courseId, lineId)] ?? { completed: 0, flawless: 0 };
}

/** A line counts as completed once it has been played to the end. */
export function isCompleted(progress: ProgressMap, courseId: string, lineId: string): boolean {
  return lineProgress(progress, courseId, lineId).completed > 0;
}

/** A line counts as mastered once it has been played through without a mistake. */
export function isMastered(progress: ProgressMap, courseId: string, lineId: string): boolean {
  return lineProgress(progress, courseId, lineId).flawless > 0;
}

export function hasCourseProgress(progress: ProgressMap, courseId: string): boolean {
  return Object.keys(progress).some((key) => key.startsWith(`${courseId}/`));
}
