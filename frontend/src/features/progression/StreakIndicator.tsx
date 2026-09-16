export function StreakIndicator({ days }: { days: number }) {
  if (days <= 0) {
    return <p className="text-sm text-slate-400">No streak yet — review something today to start one.</p>;
  }
  return (
    <p className="flex items-center gap-1 text-sm font-medium text-orange-600">
      🔥 {days} day{days === 1 ? "" : "s"} streak
    </p>
  );
}
