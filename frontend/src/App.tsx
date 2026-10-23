import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { SettingsPage } from "@/features/auth/SettingsPage";
import { DeckLayout } from "@/components/layout/DeckLayout";
import { CardDetailPage } from "@/features/cards/CardDetailPage";
import { CardSearchPage } from "@/features/cards/CardSearchPage";
import { CategoryDashboardPage } from "@/features/categories/CategoryDashboardPage";
import { CategoryPickerPage } from "@/features/categories/CategoryPickerPage";
import { CategoryBrowsePage } from "@/features/hierarchy/CategoryBrowsePage";
import { GroupDetailPage } from "@/features/hierarchy/GroupDetailPage";
import { LessonDetailPage } from "@/features/hierarchy/LessonDetailPage";
import { SrsGuidePage } from "@/features/help/SrsGuidePage";
import { ProgressionPage } from "@/features/progression/ProgressionPage";
import { ReviewSessionPage } from "@/features/reviews/ReviewSessionPage";
import { RequireAuth } from "@/routes/RequireAuth";

// Chess pulls in the engine and board libraries, so it's split out of the main bundle.
const ChessHomePage = lazy(() => import("@/features/chess/ChessHomePage").then((m) => ({ default: m.ChessHomePage })));
const ChessPlayPage = lazy(() => import("@/features/chess/ChessPlayPage").then((m) => ({ default: m.ChessPlayPage })));
const ChessCoursePage = lazy(() =>
  import("@/features/chess/ChessCoursePage").then((m) => ({ default: m.ChessCoursePage }))
);

const lazyPage = (page: ReactNode) => <Suspense fallback={null}>{page}</Suspense>;

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<CategoryPickerPage />} />
            <Route path="/srs-guide" element={<SrsGuidePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/chess" element={lazyPage(<ChessHomePage />)} />
            <Route path="/chess/play" element={lazyPage(<ChessPlayPage />)} />
            <Route path="/chess/openings/:courseId" element={lazyPage(<ChessCoursePage />)} />
          </Route>
          <Route path="/categories/:categoryId" element={<DeckLayout />}>
            <Route index element={<CategoryDashboardPage />} />
            <Route path="browse" element={<CategoryBrowsePage />} />
            <Route path="lessons/:nodeId" element={<LessonDetailPage />} />
            <Route path="groups/:nodeId" element={<GroupDetailPage />} />
            <Route path="review" element={<ReviewSessionPage />} />
            <Route path="progression" element={<ProgressionPage />} />
            <Route path="cards/:cardId" element={<CardDetailPage />} />
            <Route path="search" element={<CardSearchPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
