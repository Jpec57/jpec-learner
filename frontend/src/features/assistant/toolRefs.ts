import type { ToolRef } from "@/features/assistant/api";

// Kept out of api.ts (network calls) so it stays a plain function when tests mock that module.
export function toolRefHref(ref: ToolRef): string {
  switch (ref.kind) {
    case "category":
      return `/categories/${ref.id}`;
    case "group":
      return `/categories/${ref.category_id}/groups/${ref.id}`;
    case "lesson":
      return `/categories/${ref.category_id}/lessons/${ref.id}`;
    case "card":
      return `/categories/${ref.category_id}/cards/${ref.id}`;
  }
}
