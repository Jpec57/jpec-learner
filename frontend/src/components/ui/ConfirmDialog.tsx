import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useTranslation } from "react-i18next";

export function ConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  destructive = true,
}: {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}) {
  const { t } = useTranslation("common");

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-slate-900/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg">
          <AlertDialog.Title className="text-base font-semibold text-slate-900">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-slate-500">
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button
                onClick={onCancel}
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                {t("actions.cancel")}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                onClick={onConfirm}
                className={`rounded-md px-3 py-1.5 text-sm font-medium text-white ${
                  destructive ? "bg-red-600 hover:bg-red-500" : "bg-primary hover:bg-primary-dark"
                }`}
              >
                {t("actions.delete")}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
