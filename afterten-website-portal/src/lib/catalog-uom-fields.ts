import { normalizeUomCode, registerCatalogUomOptions } from "@/lib/uom-codes";

export type UomOption = { value: string; label: string };

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function readText(row: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = cleanText(row[key]);
    if (value) return value;
  }
  return undefined;
}

function compactUomKey(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function optionValueMatches(stored: string, optionValue: string): boolean {
  if (stored === optionValue) return true;
  if (stored.localeCompare(optionValue, undefined, { sensitivity: "accent" }) === 0) return true;

  const normalizedStored = normalizeUomCode(stored, "");
  const normalizedOption = normalizeUomCode(optionValue, "");
  if (
    normalizedStored &&
    normalizedOption &&
    normalizedStored.localeCompare(normalizedOption, undefined, { sensitivity: "accent" }) === 0
  ) {
    return true;
  }

  return compactUomKey(stored) === compactUomKey(optionValue);
}

export function catalogUomFallback(options: ReadonlyArray<UomOption>): string {
  return options[0]?.value ?? "";
}

/** Resolve a stored/input value to a catalog UOM code, or "" if not in the catalog. */
export function resolveCatalogUomCode(
  value: unknown,
  options: ReadonlyArray<UomOption>,
): string {
  const raw = cleanText(value);
  if (!raw || !options.length) return "";

  const byValue = options.find((option) => optionValueMatches(raw, option.value));
  if (byValue) return byValue.value;

  const byLabel = options.find(
    (option) =>
      option.label.localeCompare(raw, undefined, { sensitivity: "accent" }) === 0 ||
      compactUomKey(option.label) === compactUomKey(raw),
  );
  if (byLabel) return byLabel.value;

  const normalized = normalizeUomCode(raw, "");
  if (normalized) {
    const byNormalized = options.find((option) => optionValueMatches(normalized, option.value));
    if (byNormalized) return byNormalized.value;

    const byNormalizedLabel = options.find(
      (option) =>
        optionValueMatches(normalized, option.label) ||
        compactUomKey(option.label) === compactUomKey(normalized),
    );
    if (byNormalizedLabel) return byNormalizedLabel.value;
  }

  return "";
}

export function parseStoredCatalogUom(
  value: unknown,
  options: ReadonlyArray<UomOption> = [],
  fallback = "",
): string {
  const raw = cleanText(value);
  if (!raw) return fallback;
  if (!options.length) return raw;
  const resolved = resolveCatalogUomCode(raw, options);
  return resolved || fallback;
}

export function parseCatalogUomInput(
  value: unknown,
  options: ReadonlyArray<UomOption> = [],
  fallback = "",
): string {
  const raw = cleanText(value);
  if (!raw) return fallback;
  if (!options.length) return raw;
  const resolved = resolveCatalogUomCode(raw, options);
  return resolved || fallback;
}

export function resolveCatalogConsumptionUom(
  body: Record<string, unknown>,
  options: ReadonlyArray<UomOption> = [],
  fallback = "",
): string {
  const explicit =
    readText(body, ["consumption_unit", "consumption_uom", "consumptionUom"]) ?? undefined;
  if (explicit) {
    return parseCatalogUomInput(explicit, options, fallback);
  }
  return parseCatalogUomInput(
    readText(body, ["orders_app_uom", "ordersAppUom"]),
    options,
    fallback,
  );
}

export function mapCatalogUomFieldsFromRow(
  row: Record<string, unknown>,
  options: ReadonlyArray<UomOption> = [],
) {
  const consumptionRaw =
    readText(row, ["consumption_unit", "consumption_uom", "consumptionUom"]) ?? "";
  const ordersAppRaw =
    readText(row, ["orders_app_uom", "ordersAppUom"]) ?? consumptionRaw;
  const supervisorRaw =
    readText(row, ["supervisor_uom", "supervisorUom"]) ?? ordersAppRaw;

  const ordersApp = parseStoredCatalogUom(ordersAppRaw, options, ordersAppRaw);
  const consumption = parseStoredCatalogUom(consumptionRaw, options, ordersAppRaw) || ordersApp;
  const supervisor = parseStoredCatalogUom(supervisorRaw, options, ordersAppRaw);

  return {
    consumption_unit: consumption,
    orders_app_uom: ordersApp,
    supervisor_uom: supervisor,
  };
}

function readBodyUom(
  body: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  return readText(body, keys);
}

/** Resolve OrdersApp / Supervisor UOM from request body, including legacy consumption fields. */
export function resolveBodyCatalogUoms(
  body: Record<string, unknown>,
  options: ReadonlyArray<UomOption> = [],
): { orders_app_uom: string; supervisor_uom: string; consumption_uom: string } {
  const consumptionRaw =
    readBodyUom(body, ["consumption_unit", "consumption_uom", "consumptionUom"]) ?? "";
  const ordersAppRaw =
    readBodyUom(body, ["orders_app_uom", "ordersAppUom"]) ?? consumptionRaw;
  const supervisorRaw =
    readBodyUom(body, ["supervisor_uom", "supervisorUom"]) ?? ordersAppRaw;

  const ordersApp = parseCatalogUomInput(ordersAppRaw, options, ordersAppRaw);
  const supervisor = parseCatalogUomInput(supervisorRaw, options, ordersAppRaw);
  const consumption = parseCatalogUomInput(consumptionRaw, options, ordersApp) || ordersApp;

  return {
    orders_app_uom: ordersApp,
    supervisor_uom: supervisor,
    consumption_uom: consumption,
  };
}

export function applyDefaultCatalogUoms(
  ordersAppUom: string,
  supervisorUom: string,
  options: ReadonlyArray<UomOption> = [],
): { orders_app_uom: string; supervisor_uom: string } {
  const fallback = catalogUomFallback(options);
  const orders_app_uom = ordersAppUom.trim() || fallback;
  const supervisor_uom = supervisorUom.trim() || orders_app_uom || fallback;
  return { orders_app_uom, supervisor_uom };
}

/** Include stored codes in select options so edit forms show the saved UOM even if inactive. */
export function mergeCatalogUomOptionsForStored(
  options: ReadonlyArray<UomOption>,
  ...storedValues: Array<unknown>
): UomOption[] {
  const merged = [...options];
  const seen = new Set(options.map((option) => option.value));

  for (const stored of storedValues) {
    const raw = cleanText(stored);
    if (!raw) continue;

    const resolved = options.length ? resolveCatalogUomCode(raw, options) : raw;
    const value = resolved || raw;
    if (seen.has(value)) continue;

    const label =
      options.find((option) => option.value === value)?.label ??
      (resolved ? resolveCatalogUomLabel(value, options) : raw);
    merged.push({ value, label: label || value });
    seen.add(value);
  }

  return merged;
}

export function syncUomOptionsRegistry(options: ReadonlyArray<UomOption>) {
  registerCatalogUomOptions(options);
}

export function resolveCatalogUomLabel(
  code: string,
  options: ReadonlyArray<UomOption>,
): string {
  const trimmed = code.trim();
  if (!trimmed) return "";
  const match = options.find((option) => optionValueMatches(trimmed, option.value));
  return match?.label ?? trimmed;
}

/** Display label for a stored UOM code using the catalog (/api/uoms). */
export function formatCatalogUomDisplay(
  code: string | null | undefined,
  options: ReadonlyArray<UomOption>,
): string {
  const trimmed = String(code ?? "").trim();
  if (!trimmed) return "";
  if (!options.length) return trimmed;
  return resolveCatalogUomLabel(trimmed, options) || trimmed;
}
