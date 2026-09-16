import { CATEGORY_ICON_OPTIONS } from "@/features/categories/iconOptions";

export function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_ICON_OPTIONS.map((icon) => (
        <button
          key={icon}
          type="button"
          onClick={() => onChange(icon)}
          aria-pressed={value === icon}
          className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition ${
            value === icon
              ? "border-primary bg-primary-light"
              : "border-slate-200 hover:border-primary/50 hover:bg-slate-50"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
