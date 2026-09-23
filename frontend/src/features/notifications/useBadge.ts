import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getDueCount } from "@/features/notifications/api";

/** Keeps the installed PWA's app icon badge in sync with the due-review count.
 * Mounted once (see RequireAuth) so it isn't duplicated per page. */
export function useBadge() {
  const queryClient = useQueryClient();
  const { data: totalDue } = useQuery({ queryKey: ["dueCount"], queryFn: getDueCount });

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // The service worker can't reliably call setAppBadge itself in every
    // browser (Safari in particular), so on push receipt it posts here and we
    // refetch instead of waiting for the next focus-triggered refetch.
    function onMessage(event: MessageEvent) {
      if (event.data?.type === "PUSH_RECEIVED") {
        queryClient.invalidateQueries({ queryKey: ["dueCount"] });
      }
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [queryClient]);

  useEffect(() => {
    if (totalDue === undefined || !navigator.setAppBadge || !navigator.clearAppBadge) return;
    if (totalDue > 0) {
      navigator.setAppBadge(totalDue).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [totalDue]);
}
