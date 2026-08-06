"use client";

import { useEffect, useRef, useState } from "react";
import { CatalogImageThumb } from "./CatalogImageThumb";
import imageStyles from "./catalog-image.module.css";

type UploadStatus = "idle" | "uploading" | "success" | "error";

type CatalogImageFieldProps = {
  label?: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  entityType: "product" | "variant";
  entityId?: string;
  disabled?: boolean;
};

function ThreeDotsIcon() {
  return (
    <span className={imageStyles.dots} aria-hidden="true">
      <span className={imageStyles.dot} />
      <span className={imageStyles.dot} />
      <span className={imageStyles.dot} />
    </span>
  );
}

export function CatalogImageField({
  label = "Image URL (optional)",
  hint = "Link to product image",
  value,
  onChange,
  entityType,
  entityId,
  disabled = false,
}: CatalogImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (status !== "success") return;
    const timer = window.setTimeout(() => {
      setStatus("idle");
      setStatusMessage("");
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const handlePickFile = () => {
    if (disabled || status === "uploading") return;
    inputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setStatus("uploading");
    setStatusMessage("Uploading image…");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entity_type", entityType);
      if (entityId) formData.append("entity_id", entityId);

      const res = await fetch("/api/catalog/image-upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Upload failed");
      }

      const imageUrl = typeof json.image_url === "string" ? json.image_url.trim() : "";
      if (!imageUrl) throw new Error("Upload did not return an image URL");

      onChange(imageUrl);
      setStatus("success");
      setStatusMessage("Upload complete — image applied.");
    } catch (error) {
      setStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "Upload failed");
    }
  };

  const statusClass =
    status === "uploading"
      ? imageStyles.statusUploading
      : status === "success"
        ? imageStyles.statusSuccess
        : status === "error"
          ? imageStyles.statusError
          : "";

  return (
    <div className={imageStyles.field}>
      <div className={imageStyles.labelRow}>
        <span className={imageStyles.label}>{label}</span>
        <button
          type="button"
          className={imageStyles.menuButton}
          onClick={handlePickFile}
          disabled={disabled || status === "uploading"}
          aria-label="Upload image"
          title="Upload image"
        >
          <ThreeDotsIcon />
        </button>
      </div>
      <p className={imageStyles.hint}>{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className={imageStyles.hiddenInput}
        onChange={handleFileChange}
      />
      <div className={imageStyles.previewWrap}>
        <CatalogImageThumb url={value} alt={label} rounded placeholder="Preview" />
      </div>
      <input
        className={imageStyles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://…"
        disabled={disabled || status === "uploading"}
      />
      <p className={`${imageStyles.status} ${statusClass}`} aria-live="polite">
        {statusMessage}
      </p>
    </div>
  );
}
