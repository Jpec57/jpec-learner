import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { SettingsPage } from "@/features/auth/SettingsPage";
import { CategoryDashboardPage } from "@/features/categories/CategoryDashboardPage";
import { CategoryPickerPage } from "@/features/categories/CategoryPickerPage";
import { CategoryBrowsePage } from "@/features/hierarchy/CategoryBrowsePage";
import { GroupDetailPage } from "@/features/hierarchy/GroupDetailPage";
import { LessonDetailPage } from "@/features/hierarchy/LessonDetailPage";
import { ProgressionPage } from "@/features/progression/ProgressionPage";
import { ReviewSessionPage } from "@/features/reviews/ReviewSessionPage";
import { RequireAuth } from "@/routes/RequireAuth";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<CategoryPickerPage />} />
            <Route path="/categories/:categoryId" element={<CategoryDashboardPage />} />
            <Route path="/categories/:categoryId/browse" element={<CategoryBrowsePage />} />
            <Route path="/categories/:categoryId/lessons/:nodeId" element={<LessonDetailPage />} />
            <Route path="/categories/:categoryId/groups/:nodeId" element={<GroupDetailPage />} />
            <Route path="/categories/:categoryId/review" element={<ReviewSessionPage />} />
            <Route path="/categories/:categoryId/progression" element={<ProgressionPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
