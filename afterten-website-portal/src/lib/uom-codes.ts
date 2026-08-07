import { DEFAULT_UOM_OPTIONS, formatUomLabel } from "@/lib/default-uom-options";

const CODE_BY_KEY = new Map<string, string>();

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

for (const option of DEFAULT_UOM_OPTIONS) {
  registerCode(option.value);
  registerCode(option.label);
}

export function registerUomCodes(codes: ReadonlyArray<string>) {
  for (const code of codes) {
    registerCode(code);
  }
}

/** Register only UOMs from the catalog admin list (code + label aliases). */
export function registerCatalogUomOptions(
  options: ReadonlyArray<{ value: string; label: string }>,
) {
  for (const option of options) {
    const code = option.value.trim();
    if (!code) continue;
    registerCode(code);
    const label = option.label.trim();
    if (label) registerAlias(label, code);
  }
}

registerCode("each");
registerAlias("pieces", "pc");
registerAlias("piece", "pc");
registerAlias("pcs", "pc");

export function normalizeUomCode(value: unknown, fallback = "pc"): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return fallback;

  const direct = CODE_BY_KEY.get(trimmed.toLowerCase());
  if (direct) return direct;

  const withoutSuffix = trimmed
    .replace(/\(es\)$/i, "es")
    .replace(/\(s\)$/i, "s");
  const fromSuffix = CODE_BY_KEY.get(withoutSuffix.toLowerCase());
  if (fromSuffix) return fromSuffix;

  return trimmed;
}

export function resolveUomSelectValue(
  value: string | null | undefined,
  options: ReadonlyArray<{ value: string }>,
  fallback = "pc",
): string {
  const normalized = normalizeUomCode(value, fallback);
  if (options.some((option) => option.value === normalized)) return normalized;
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw && options.some((option) => option.value === raw)) return raw;
  return normalized;
}
