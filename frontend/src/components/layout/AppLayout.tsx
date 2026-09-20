import { Outlet } from "react-router-dom";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { AssistantChatPanel } from "@/features/assistant/AssistantChatPanel";

export function AppLayout() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-64 h-96 w-96 rounded-full bg-accent/10 blur-3xl"
      />
      <Header />
      <main className="relative flex-1 px-4 py-8">
        <Outlet />
      </main>
      <Footer />
      <AssistantChatPanel />
    </div>
  );
}
