import { useState } from "react";
import { resolveCatalogImageUrl } from "@/lib/catalog-image-url";
import imageStyles from "./catalog-image.module.css";

type CatalogImageThumbProps = {
  url?: string | null;
  alt: string;
  compact?: boolean;
  rounded?: boolean;
  placeholder?: string;
};

export function CatalogImageThumb({
  url,
  alt,
  compact = false,
  rounded = false,
  placeholder = "No image",
}: CatalogImageThumbProps) {
  const [failed, setFailed] = useState(false);
  const resolvedUrl = resolveCatalogImageUrl(url);
  const wrapClass = compact
    ? imageStyles.thumbCompact
    : rounded
      ? imageStyles.thumbRounded
      : imageStyles.thumb;

  if (!resolvedUrl || failed) {
    return (
      <div className={wrapClass} aria-hidden={compact ? undefined : true}>
        <span className={imageStyles.placeholder}>{placeholder}</span>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={imageStyles.image}
        src={resolvedUrl}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
