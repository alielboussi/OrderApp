export type DefaultUomOption = { value: string; label: string };

export const DEFAULT_UOM_VALUES = [
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
  "Roll",
  "Bundle",
] as const;

export function formatUomLabel(unit: string): string {
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
                                                : lower === "roll"
                                                  ? "Roll(s)"
                                                  : lower === "bundle"
                                                    ? "Bundle(s)"
                                                    : null;
  if (mapped) return mapped;
  const capitalized = `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  return capitalized.endsWith("(s)") ? capitalized : `${capitalized}(s)`;
}

export const DEFAULT_UOM_OPTIONS: DefaultUomOption[] = DEFAULT_UOM_VALUES.map((value) => ({
  value,
  label: formatUomLabel(value),
}));

export function defaultUomRecords(): Array<{
  code: string;
  label: string;
  active: boolean;
  sort_order: number;
}> {
  return DEFAULT_UOM_OPTIONS.map((option, index) => ({
    code: option.value,
    label: option.label,
    active: true,
    sort_order: index,
  }));
}
