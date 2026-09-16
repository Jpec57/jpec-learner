import { useQuery } from "@tanstack/react-query";

import { me } from "@/features/auth/api";
import { useAuthStore } from "@/lib/authStore";

export function CategoryPickerPage() {
  const clearTokens = useAuthStore((state) => state.clearTokens);
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: me });

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">
            {user ? `Welcome back, ${user.display_name ?? user.email}` : "JpecLearner"}
          </h1>
          <button
            onClick={() => clearTokens()}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Log out
          </button>
        </div>
        <p className="mt-2 text-slate-500">
          Categories (Maths, Japanese, …) will appear here as selectable cards. This is the
          Phase 1 scaffold — category CRUD lands in Phase 2.
        </p>
      </div>
    </div>
  );
}
