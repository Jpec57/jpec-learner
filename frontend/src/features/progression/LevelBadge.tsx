import { useQuery } from "@tanstack/react-query";

import { listLevels } from "@/features/progression/api";

function tierClasses(level: number): string {
  if (level >= 10) return "bg-amber-100 text-amber-800 border-amber-300";
  if (level >= 7) return "bg-violet-100 text-violet-800 border-violet-300";
  if (level >= 4) return "bg-sky-100 text-sky-800 border-sky-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

export function LevelBadge({ level }: { level: number }) {
  const { data: levels } = useQuery({ queryKey: ["levels"], queryFn: listLevels, staleTime: Infinity });
  const rounded = Math.max(1, Math.min(10, Math.round(level)));
  const name = levels?.find((l) => l.level === rounded)?.name_en ?? `Level ${rounded}`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tierClasses(rounded)}`}
    >
      Lv. {rounded} · {name}
    </span>
  );
}
