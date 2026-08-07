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
  "Roll",
  "Bundle",
] as const;

const CODE_BY_KEY = new Map<string, string>();

function formatUomLabel(unit: string): string {
  const trimmed = unit.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (lower === "each") return "Each";
  if (lower === "pc" || lower === "pcs") return "Pc(s)";
  if (lower === "g") return "Gram(s)";
  if (lower === "kg") return "Kilogram(s)";
  if (lower === "mg") return "Milligram(s)";
  if (lower === "ml") return "Millilitre(s)";
  if (lower === "l") return "Litre(s)";
  if (lower === "cup") return "Cup(s)";
  if (lower === "straw") return "Straw(s)";
  if (lower === "toilet paper") return "Toilet Paper(s)";
  if (lower === "case") return "Case(s)";
  if (lower === "crate") return "Crate(s)";
  if (lower === "bottle") return "Bottle(s)";
  if (lower === "tin can") return "Tin Can(s)";
  if (lower === "jar") return "Jar(s)";
  if (lower === "block") return "Block(s)";
  if (lower === "bucket") return "Bucket(s)";
  if (lower === "bag") return "Bag(s)";
  if (lower === "tray") return "Tray(s)";
  if (lower === "plastic") return "Plastic(s)";
  if (lower === "packet") return "Packet(s)";
  if (lower === "box") return "Box(es)";
  if (lower === "roll") return "Roll(s)";
  if (lower === "bundle") return "Bundle(s)";
  const capitalized = `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  return capitalized.endsWith("(s)") ? capitalized : `${capitalized}(s)`;
}

function registerAlias(alias: string, code: string) {
  const trimmed = alias.trim();
  if (!trimmed) return;
  CODE_BY_KEY.set(trimmed.toLowerCase(), code);
}

function registerCode(code: string) {
  const canonical = code.trim();
  if (!canonical) return;
  registerAlias(canonical, canonical);
  registerAlias(formatUomLabel(canonical), canonical);
  const label = formatUomLabel(canonical);
  const esMatch = label.match(/^(.+)\(es\)$/i);
  if (esMatch) registerAlias(esMatch[1], canonical);
  const sMatch = label.match(/^(.+)\(s\)$/i);
  if (sMatch) registerAlias(sMatch[1], canonical);
}

for (const value of DEFAULT_UOM_VALUES) registerCode(value);
registerCode("each");
registerAlias("pieces", "pc");
registerAlias("piece", "pc");
registerAlias("pcs", "pc");

export function normalizeUomCode(value: unknown, fallback = "pc"): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return fallback;

  const direct = CODE_BY_KEY.get(trimmed.toLowerCase());
  if (direct) return direct;

  const withoutSuffix = trimmed.replace(/\(es\)$/i, "es").replace(/\(s\)$/i, "s");
  const fromSuffix = CODE_BY_KEY.get(withoutSuffix.toLowerCase());
  if (fromSuffix) return fromSuffix;

  return trimmed;
}
