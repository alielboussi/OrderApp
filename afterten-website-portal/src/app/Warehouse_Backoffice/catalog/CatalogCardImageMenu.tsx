"use client";

import { useRef, useState } from "react";
import { catalogApiHeaders } from "@/lib/catalog-api-headers";
import imageStyles from "./catalog-image.module.css";
import menuStyles from "./menu/menu.module.css";

type CatalogCardImageMenuProps = {
  entityType: "product" | "variant";
  entityId: string;
  itemId?: string;
  disabled?: boolean;
  overlay?: boolean;
  menuClassName?: string;
  actor?: { userId?: string | null; userEmail?: string | null };
  onImageUpdated: (imageUrl: string) => void;
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

export function CatalogCardImageMenu({
  entityType,
  entityId,
  itemId,
  disabled = false,
  overlay = true,
  menuClassName,
  actor,
  onImageUpdated,
}: CatalogCardImageMenuProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const handlePickFile = () => {
    if (disabled || busy) return;
    inputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setStatusMessage("Uploading…");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entity_type", entityType === "variant" ? "variant" : "product");
      formData.append("entity_id", entityId);

      const uploadRes = await fetch("/api/catalog/image-upload", {
        method: "POST",
        body: formData,
      });
      const uploadJson = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        throw new Error(typeof uploadJson.error === "string" ? uploadJson.error : "Upload failed");
      }

      const imageUrl = typeof uploadJson.image_url === "string" ? uploadJson.image_url.trim() : "";
      if (!imageUrl) throw new Error("Upload did not return an image URL");

      const saveBody =
        entityType === "variant"
          ? { id: entityId, item_id: itemId, image_url: imageUrl }
          : { id: entityId, image_url: imageUrl };

      const saveRes = await fetch(
        entityType === "variant" ? "/api/catalog/variants" : "/api/catalog/items",
        {
          method: "PUT",
          headers: catalogApiHeaders(actor),
          body: JSON.stringify(saveBody),
        },
      );
      const saveJson = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) {
        throw new Error(typeof saveJson.error === "string" ? saveJson.error : "Unable to save image");
      }

      onImageUpdated(imageUrl);
      setStatusMessage("Image saved");
      window.setTimeout(() => setStatusMessage(""), 2500);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className={imageStyles.hiddenInput}
        onChange={handleFileChange}
      />
      <button
        type="button"
        className={`${imageStyles.menuButton} ${menuClassName ?? (overlay ? menuStyles.cardImageMenuButton : menuStyles.rowImageMenuButton)}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handlePickFile();
        }}
        disabled={disabled || busy}
        aria-label={entityType === "variant" ? "Set variant image" : "Set product image"}
        title={busy ? "Uploading…" : "Set image"}
      >
        <ThreeDotsIcon />
      </button>
      {overlay && statusMessage ? (
        <span className={menuStyles.cardImageMenuStatus} aria-live="polite">
          {statusMessage}
        </span>
      ) : null}
    </>
  );
}
