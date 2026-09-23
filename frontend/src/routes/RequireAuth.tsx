import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import i18n from "i18next";
import { Navigate, Outlet } from "react-router-dom";

import { me } from "@/features/auth/api";
import { useBadge } from "@/features/notifications/useBadge";
import { useAuthStore } from "@/lib/authStore";

function useSyncUserLocale() {
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: me });
  useEffect(() => {
    if (user?.locale && user.locale !== i18n.language) {
      i18n.changeLanguage(user.locale);
    }
  }, [user?.locale]);
}

export function RequireAuth() {
  const accessToken = useAuthStore((state) => state.accessToken);
  useSyncUserLocale();
  useBadge();
  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
