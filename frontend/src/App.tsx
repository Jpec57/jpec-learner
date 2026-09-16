import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { CategoryDashboardPage } from "@/features/categories/CategoryDashboardPage";
import { CategoryPickerPage } from "@/features/categories/CategoryPickerPage";
import { CategoryBrowsePage } from "@/features/hierarchy/CategoryBrowsePage";
import { RequireAuth } from "@/routes/RequireAuth";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<CategoryPickerPage />} />
          <Route path="/categories/:categoryId" element={<CategoryDashboardPage />} />
          <Route path="/categories/:categoryId/browse" element={<CategoryBrowsePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
