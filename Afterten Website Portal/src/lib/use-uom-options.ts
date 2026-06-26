"use client";

import { useEffect, useState } from "react";

export type UomOption = { value: string; label: string };

const DEFAULT_UOM_VALUES = [
  "pc",
  "g",
  "kg",
  "mg",
  "ml",
  "l",
  "cup",
  "straw",
  "toilet paper",
  "case",
  "crate",
  "bottle",
  "Tin Can",
  "Jar",
  "Block",
  "Bucket",
  "Bag",
  "Tray",
  "plastic",
  "Packet",
  "Box",
] as const;

export const formatUomLabel = (unit: string) => {
  const trimmed = unit.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const mapped =
    lower === "each"
      ? "Each"
      : lower === "pc" || lower === "pcs"
        ? "Pc(s)"
      : lower === "g"
        ? "Gram(s)"
        : lower === "kg"
          ? "Kilogram(s)"
          : lower === "mg"
            ? "Milligram(s)"
            : lower === "ml"
              ? "Millilitre(s)"
              : lower === "l"
                ? "Litre(s)"
                : lower === "cup"
                  ? "Cup(s)"
                : lower === "straw"
                  ? "Straw(s)"
                : lower === "toilet paper"
                  ? "Toilet Paper(s)"
                : lower === "case"
                  ? "Case(s)"
                  : lower === "crate"
                    ? "Crate(s)"
                    : lower === "bottle"
                      ? "Bottle(s)"
                      : lower === "tin can"
                        ? "Tin Can(s)"
                        : lower === "jar"
                          ? "Jar(s)"
                          : lower === "block"
                            ? "Block(s)"
                            : lower === "bucket"
                              ? "Bucket(s)"
                              : lower === "bag"
                                ? "Bag(s)"
                                : lower === "tray"
                                  ? "Tray(s)"
                                  : lower === "plastic"
                                    ? "Plastic(s)"
                                    : lower === "packet"
                                      ? "Packet(s)"
                                      : lower === "box"
                                        ? "Box(es)"
                                        : null;
  if (mapped) return mapped;
  const capitalized = `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  return capitalized.endsWith("(s)") ? capitalized : `${capitalized}(s)`;
};

export const DEFAULT_UOM_OPTIONS: UomOption[] = DEFAULT_UOM_VALUES.map((value) => ({
  value,
  label: formatUomLabel(value),
}));

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
