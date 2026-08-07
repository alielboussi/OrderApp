"use client";

import { useCallback, useEffect, useState } from "react";
import { resolveCatalogUomLabel, syncUomOptionsRegistry } from "@/lib/catalog-uom-fields";

export type UomOption = { value: string; label: string };

export function useUomOptions(): { uoms: UomOption[]; ready: boolean } {
  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/uoms");
        if (!response.ok) throw new Error("Unable to load UOM catalog");
        const payload = await response.json();
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const normalized = items
          .map((item: { value?: string; code?: string; label?: string }) => {
            const value = String(item.value ?? item.code ?? "").trim();
            const label = String(item.label ?? "").trim();
            if (!value || !label) return null;
            return { value, label } as UomOption;
          })
          .filter((item: UomOption | null): item is UomOption => Boolean(item));
        if (active) {
          syncUomOptionsRegistry(normalized);
          setUoms(normalized);
        }
      } catch {
        if (active) setUoms([]);
      } finally {
        if (active) setReady(true);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  return { uoms, ready };
}

/** Catalog-backed label lookup for display (source of truth: /api/uoms). */
export function useUomCatalog() {
  const { uoms, ready } = useUomOptions();
  const formatUom = useCallback(
    (code: string | null | undefined) => {
      const trimmed = String(code ?? "").trim();
      if (!trimmed) return "";
      return resolveCatalogUomLabel(trimmed, uoms) || trimmed;
    },
    [uoms],
  );
  return { uoms, ready, formatUom };
}