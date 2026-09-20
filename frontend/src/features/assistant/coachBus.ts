// The dashboard's plan section and the chat panel (mounted once in the deck
// layout) are siblings, so "ask the coach" is a window event instead of props.
const COACH_EVENT = "jpeclearner:open-coach";

export function openCoach(prompt?: string): void {
  window.dispatchEvent(new CustomEvent<{ prompt?: string }>(COACH_EVENT, { detail: { prompt } }));
}

export function onOpenCoach(handler: (prompt?: string) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<{ prompt?: string }>).detail?.prompt);
  window.addEventListener(COACH_EVENT, listener);
  return () => window.removeEventListener(COACH_EVENT, listener);
}
