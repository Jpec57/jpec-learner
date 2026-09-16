import { useCallback, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * Promise-based replacement for `window.confirm()` (which blocks the page and
 * can't be driven by browser automation). Usage:
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (await confirm(title, description)) { ... }
 *   return <>{dialog}...</>;
 */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; description: string } | null>(null);
  const resolver = useRef<(value: boolean) => void>();

  const confirm = useCallback((title: string, description: string) => {
    setState({ title, description });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(value: boolean) {
    setState(null);
    resolver.current?.(value);
  }

  const dialog = state && (
    <ConfirmDialog
      open
      title={state.title}
      description={state.description}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, dialog };
}
