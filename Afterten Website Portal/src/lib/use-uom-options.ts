"use client";

import { useEffect, useState } from "react";
import { DEFAULT_UOM_OPTIONS, formatUomLabel, type DefaultUomOption } from "./default-uom-options";

export type UomOption = DefaultUomOption;

export { DEFAULT_UOM_OPTIONS, formatUomLabel };

export function useUomOptions() {
  const [uoms, setUoms] = useState<UomOption[]>(DEFAULT_UOM_OPTIONS);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/uoms");
        if (!response.ok) return;
        const payload = await response.json();
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const normalized = items
          .map((item: { value?: string; code?: string; label?: string }) => {
            const value = String(item.value ?? item.code ?? "").trim();
            if (!value) return null;
            const label = String(item.label ?? value).trim() || formatUomLabel(value);
            return { value, label } as UomOption;
          })
          .filter((item: UomOption | null): item is UomOption => Boolean(item));
        if (active && normalized.length) {
          setUoms(normalized);
        }
      } catch {
        if (active) setUoms(DEFAULT_UOM_OPTIONS);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  return uoms;
}
