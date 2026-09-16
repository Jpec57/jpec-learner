import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { deleteImage, mediaUrl, uploadImage, type ImageOut } from "@/features/images/api";

export function ImageUploadInput({
  images,
  target,
  onChange,
}: {
  images: ImageOut[];
  target: { card_id: string } | { lesson_node_id: string };
  onChange: (images: ImageOut[]) => void;
}) {
  const { t } = useTranslation("cards");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const image = await uploadImage(file, target);
      onChange([...images, image]);
    } catch {
      setError(t("uploadError"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    await deleteImage(id);
    onChange(images.filter((img) => img.id !== id));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {images.map((image) => (
          <div key={image.id} className="group relative h-20 w-20 overflow-hidden rounded-md border border-slate-200">
            <img src={mediaUrl(image.url)} alt="" className="h-full w-full object-cover" />
            <button
              onClick={() => handleDelete(image.id)}
              className="absolute right-0.5 top-0.5 hidden h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white group-hover:flex"
              aria-label={t("removeImage")}
            >
              ×
            </button>
          </div>
        ))}
        <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-slate-300 text-xs text-slate-400 hover:border-primary/50 hover:text-primary-dark">
          {uploading ? "…" : t("addPhoto")}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            className="hidden"
          />
        </label>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
