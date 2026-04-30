"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
import { buildStocktakeVariancePdfHtml } from "../stock-reports/stocktakepdf";
import styles from "./stocktakes.module.css";
import { COLDROOM_CHILDREN, COLDROOM_CHILD_IDS, COLDROOM_PARENT_ID, COLDROOM_WAREHOUSES } from "@/lib/coldrooms";

type WarehouseOption = { id: string; name: string | null; code: string | null; active?: boolean | null };

type StockPeriod = {
  id: string;
  warehouse_id: string;
  outlet_id: string | null;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  note: string | null;
  stocktake_number: string | null;
};

type WarehouseStockItem = {
  warehouse_id?: string | null;
  item_id: string;
  item_name: string | null;
  variant_key: string | null;
  net_units: number | null;
  unit_cost: number | null;
  item_kind: string | null;
  image_url: string | null;
  has_recipe?: boolean | null;
};

type SimpleVariation = {
  id: string;
  item_id: string;
  name: string | null;
  image_url: string | null;
  consumption_uom: string | null;
  stocktake_uom: string | null;
  purchase_pack_unit?: string | null;
  qty_decimal_places: number | null;
  cost: number | null;
  active?: boolean | null;
};

type SimpleProduct = {
  id: string;
  name: string | null;
  image_url?: string | null;
  item_kind?: string | null;
  consumption_uom: string | null;
  stocktake_uom: string | null;
  purchase_pack_unit: string | null;
  default_warehouse_id?: string | null;
  qty_decimal_places: number | null;
  selling_price: number | null;
  cost: number | null;
};

type StockCountRow = {
  period_id?: string | null;
  item_id: string;
  variant_key: string | null;
  counted_qty: number;
  counted_at: string | null;
  kind: string | null;
};

type PeriodCountDisplay = {
  itemId: string;
  itemName: string;
  variantKey: string;
  variantName: string;
  qty: number;
  kind: string;
};

type VarianceRow = {
  period_id: string;
  warehouse_id: string;
  outlet_id: string | null;
  item_id: string;
  item_name: string | null;
  variant_key: string | null;
  opening_qty: number | null;
  movement_qty: number | null;
  closing_qty: number | null;
  expected_qty: number | null;
  variance_qty: number | null;
  unit_cost: number | null;
  variance_cost: number | null;
};

type VarianceApiResponse = {
  include_sales?: boolean;
  period: {
    id: string;
    opened_at: string | null;
    closed_at: string | null;
    stocktake_number: string | null;
    warehouse_id: string;
  };
  rows: Array<{
    item_id?: string | null;
    item_name: string | null;
    item_kind?: string | null;
    variant_key: string | null;
    variant_label?: string | null;
    variant_name?: string | null;
    is_variant?: boolean | null;
    opening_qty: number | null;
    transfer_qty: number | null;
    damage_qty: number | null;
    sales_qty: number | null;
    closing_qty: number | null;
    expected_qty: number | null;
    variance_qty: number | null;
    unit_cost?: number | null;
    variance_cost: number | null;
    variant_amount?: number | null;
  }>;
};

type RoleDescriptor = {
  id?: string | null;
  slug?: string | null;
  normalized_slug?: string | null;
  display_name?: string | null;
};

type WhoamiRoles = {
  outlets?: Array<{ outlet_id?: string | null; outlet_name?: string | null }> | null;
  roles?: string[] | null;
  role_catalog?: RoleDescriptor[] | null;
};

type CountInput = {
  itemId: string;
  qty: number;
  variantKey: string;
  kind: "opening" | "closing";
};

type ConfirmState = {
  title: string;
  message: string;
  onConfirm: () => void;
};

type ViewMode = "dashboard" | "periods" | "counts" | "periodCounts" | "variance";

const STOCKTAKE_ROLE_ID = "95b6a75d-bd46-4764-b5ea-981b1608f1ca";
const STOCKTAKE_SLUGS = new Set(["stock operator", "stocktake", "stock_taker"]);

function normalizeRoleValue(value?: string | null): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function hasStocktakeRole(roles: RoleDescriptor[]): boolean {
  const targetId = normalizeRoleValue(STOCKTAKE_ROLE_ID);
  return roles.some((role) => {
    const roleId = normalizeRoleValue(role.id);
    if (roleId && targetId && roleId === targetId) return true;
    const slug = normalizeRoleValue(role.slug) || normalizeRoleValue(role.normalized_slug);
    const display = normalizeRoleValue(role.display_name);
    return (slug && STOCKTAKE_SLUGS.has(slug)) || (display && STOCKTAKE_SLUGS.has(display));
  });
}

function normalizeVariantKey(value?: string | null): string {
  const raw = value?.trim().toLowerCase() ?? "";
  return raw.length ? raw : "base";
}

function makeKey(itemId: string, variantKey?: string | null): string {
  return `${itemId}|${normalizeVariantKey(variantKey)}`.toLowerCase();
}

function makeChildKey(childId: string, itemId: string, variantKey?: string | null): string {
  return `${childId}::${makeKey(itemId, variantKey)}`.toLowerCase();
}

function formatStamp(raw?: string | null): string {
  if (!raw) return "--";
  const trimmed = raw.replace("T", " ");
  return trimmed.length > 19 ? trimmed.slice(0, 19) : trimmed;
}

function formatUtcIso(value?: string | null): string | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  const normalized = raw.replace(" ", "T");
  const candidate = normalized.endsWith("Z") || normalized.includes("+") ? normalized : `${normalized}Z`;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function formatUomLabel(raw?: string | null): string {
  const key = raw?.trim().toLowerCase() ?? "";
  switch (key) {
    case "g":
    case "gram":
    case "grams":
    case "g(s)":
      return "Gram(s)";
    case "kg":
    case "kilogram":
    case "kilograms":
    case "kg(s)":
      return "Kilogram(s)";
    case "mg":
    case "milligram":
    case "milligrams":
    case "mg(s)":
      return "Milligram(s)";
    case "ml":
    case "millilitre":
    case "millilitres":
    case "ml(s)":
      return "Millilitre(s)";
    case "l":
    case "litre":
    case "litres":
    case "l(s)":
      return "Litre(s)";
    case "each":
      return "Each";
    case "case":
    case "case(s)":
      return "Case(s)";
    case "crate":
    case "crate(s)":
      return "Crate(s)";
    case "bottle":
    case "bottle(s)":
      return "Bottle(s)";
    case "tin can":
    case "tin can(s)":
      return "Tin Can(s)";
    case "jar":
    case "jar(s)":
      return "Jar(s)";
    case "block":
    case "block(s)":
      return "Block(s)";
    case "plastic":
    case "plastic(s)":
      return "Plastic(s)";
    case "packet":
    case "packet(s)":
      return "Packet(s)";
    case "box":
    case "box(es)":
      return "Box(es)";
    case "bag":
    case "bag(s)":
      return "Bag(s)";
    case "bucket":
    case "bucket(s)":
      return "Bucket(s)";
    case "tray":
    case "tray(s)":
      return "Tray(s)";
    default:
      if (!key) return "Each";
      return key.replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function defaultDecimalsForUom(raw?: string | null): number {
  const key = raw?.trim().toLowerCase() ?? "";
  switch (key) {
    case "g":
    case "kg":
    case "mg":
    case "ml":
    case "l":
      return 2;
    case "each":
    case "case":
    case "crate":
    case "bottle":
    case "tin can":
    case "jar":
    case "plastic":
    case "packet":
    case "box":
    case "bag":
    case "bucket":
    case "tray":
      return 0;
    default:
      return 2;
  }
}

function sanitizeQtyInput(raw: string, decimals: number): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (decimals <= 0) return cleaned.replace(/\./g, "");
  const [whole = "", frac = ""] = cleaned.split(".", 2);
  const normalizedWhole = whole || (cleaned.startsWith(".") ? "0" : "");
  const clippedFrac = frac.slice(0, Math.min(decimals, 6));
  return cleaned.includes(".") ? `${normalizedWhole}.${clippedFrac}` : normalizedWhole;
}

function stepForDecimals(decimals: number): number {
  const safe = Math.min(Math.max(decimals, 0), 6);
  return safe === 0 ? 1 : 1 / Math.pow(10, safe);
}

function formatQty(value: number, decimals: number): string {
  return value.toFixed(Math.min(Math.max(decimals, 0), 6));
}

async function loadLogoDataUrl(): Promise<string | undefined> {
  try {
    const candidates = ["/afterten-logo.png", "/afterten_logo.png"];
    let blob: Blob | null = null;
    for (const path of candidates) {
      const response = await fetch(path, { cache: "force-cache" });
      if (response.ok) {
        blob = await response.blob();
        break;
      }
    }
    if (!blob) return undefined;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read logo"));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export default function StocktakesPage() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const { status, readOnly } = useWarehouseAuth();

  const [view, setView] = useState<ViewMode>("dashboard");
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [selectedChildWarehouseIds, setSelectedChildWarehouseIds] = useState<string[]>(COLDROOM_CHILD_IDS);
  const [childOpenPeriods, setChildOpenPeriods] = useState<Record<string, StockPeriod | null>>({});
  const [childOpeningLockedKeys, setChildOpeningLockedKeys] = useState<Record<string, Set<string>>>({});
  const [openPeriod, setOpenPeriod] = useState<StockPeriod | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<StockPeriod | null>(null);
  const [periods, setPeriods] = useState<StockPeriod[]>([]);
  const [items, setItems] = useState<WarehouseStockItem[]>([]);
  const [allItems, setAllItems] = useState<WarehouseStockItem[]>([]);
  const [variations, setVariations] = useState<SimpleVariation[]>([]);
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [productUoms, setProductUoms] = useState<Record<string, string>>({});
  const [stocktakeUoms, setStocktakeUoms] = useState<Record<string, string>>({});
  const [qtyDecimals, setQtyDecimals] = useState<Record<string, number>>({});
  const [periodOpeningCounts, setPeriodOpeningCounts] = useState<PeriodCountDisplay[]>([]);
  const [periodClosingCounts, setPeriodClosingCounts] = useState<PeriodCountDisplay[]>([]);
  const [openingLockedKeys, setOpeningLockedKeys] = useState<Set<string>>(new Set());
  const [closingLockedKeys, setClosingLockedKeys] = useState<Set<string>>(new Set());
  const [recipeIngredients, setRecipeIngredients] = useState<Record<string, string[]>>({});
  const [recipeIngredientsLoading, setRecipeIngredientsLoading] = useState<Set<string>>(new Set());
  const [variance, setVariance] = useState<VarianceRow[]>([]);
  const [varianceIncludeSales, setVarianceIncludeSales] = useState(true);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  const [periodCountsError, setPeriodCountsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [periodCountsLoading, setPeriodCountsLoading] = useState(false);
  const [varianceLoading, setVarianceLoading] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [hasStocktakeAccess, setHasStocktakeAccess] = useState(true);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogItemId, setDialogItemId] = useState("");
  const [dialogItemName, setDialogItemName] = useState("");
  const [dialogItemKind, setDialogItemKind] = useState<string | null>(null);
  const [dialogQty, setDialogQty] = useState<Record<string, string>>({});
  const [unsavedKeys, setUnsavedKeys] = useState<Record<string, boolean>>({});
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [lastCount, setLastCount] = useState<{ kind: string; counted_qty: number } | null>(null);

  const autoImportAttempted = useRef<Set<string>>(new Set());

  const handleBack = () => router.push("/Warehouse_Backoffice");
  const handleBackOne = () => router.back();

  const toggleChildWarehouse = (id: string) => {
    setSelectedChildWarehouseIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const selectAllChildWarehouses = () => {
    setSelectedChildWarehouseIds(COLDROOM_CHILD_IDS);
  };

  const clearChildWarehouses = () => {
    setSelectedChildWarehouseIds([]);
  };

  const warehouseNameMap = useMemo(() => {
    const map = new Map<string, { name: string | null; code: string | null }>();
    warehouses.forEach((warehouse) => {
      map.set(warehouse.id, { name: warehouse.name ?? null, code: warehouse.code ?? null });
    });
    return map;
  }, [warehouses]);

  const variationsByItemId = useMemo(() => {
    const map = new Map<string, SimpleVariation[]>();
    variations.forEach((variation) => {
      if (!variation.item_id) return;
      const existing = map.get(variation.item_id) ?? [];
      existing.push(variation);
      map.set(variation.item_id, existing);
    });
    return map;
  }, [variations]);

  const variantLabelMap = useMemo(() => {
    const map = new Map<string, string>([["base", "Base"]]);
    variations.forEach((variation) => {
      const label = variation.name?.trim() || variation.id;
      const key = normalizeVariantKey(variation.id);
      map.set(key, label);
    });
    return map;
  }, [variations]);

  const variantUomMap = useMemo(() => {
    const map = new Map<string, string>();
    variations.forEach((variation) => {
      const key = normalizeVariantKey(variation.id);
      const uom =
        variation.purchase_pack_unit?.trim() ||
        variation.stocktake_uom?.trim() ||
        variation.consumption_uom?.trim() ||
        "each";
      map.set(key, uom);
    });
    return map;
  }, [variations]);

  const variantStocktakeUomMap = useMemo(() => {
    const map = new Map<string, string>();
    variations.forEach((variation) => {
      const key = normalizeVariantKey(variation.id);
      const uom =
        variation.purchase_pack_unit?.trim() ||
        variation.stocktake_uom?.trim() ||
        variation.consumption_uom?.trim() ||
        "each";
      map.set(key, uom);
    });
    return map;
  }, [variations]);

  const variantImageMap = useMemo(() => {
    const map = new Map<string, string>();
    variations.forEach((variation) => {
      const key = normalizeVariantKey(variation.id);
      if (variation.image_url?.trim()) {
        map.set(key, variation.image_url.trim());
      }
    });
    return map;
  }, [variations]);

  const allItemsByItemId = useMemo(() => {
    const source = allItems.length ? allItems : items;
    return source.reduce((acc, row) => {
      const list = acc.get(row.item_id) ?? [];
      list.push(row);
      acc.set(row.item_id, list);
      return acc;
    }, new Map<string, WarehouseStockItem[]>());
  }, [allItems, items]);

  const displayItemsByItemId = useMemo(() => {
    return items.reduce((acc, row) => {
      const list = acc.get(row.item_id) ?? [];
      list.push(row);
      acc.set(row.item_id, list);
      return acc;
    }, new Map<string, WarehouseStockItem[]>());
  }, [items]);

  const filteredDisplayItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((row) => {
      const itemName = row.item_name?.toLowerCase() ?? "";
      const itemMatch = itemName.includes(term) || row.item_id.toLowerCase().includes(term);
      if (itemMatch) return true;
      const key = normalizeVariantKey(row.variant_key);
      const label = variantLabelMap.get(key)?.toLowerCase() ?? "";
      return label.includes(term);
    });
  }, [items, search, variantLabelMap]);

  const openingCountMap = useMemo(() => {
    const map = new Map<string, number>();
    periodOpeningCounts.forEach((row) => {
      map.set(makeKey(row.itemId, row.variantKey), row.qty);
    });
    return map;
  }, [periodOpeningCounts]);

  const closingCountMap = useMemo(() => {
    const map = new Map<string, number>();
    periodClosingCounts.forEach((row) => {
      map.set(makeKey(row.itemId, row.variantKey), row.qty);
    });
    return map;
  }, [periodClosingCounts]);

  const openPeriods = useMemo(() => periods.filter((period) => period.status?.toLowerCase() === "open"), [periods]);
  const closedPeriods = useMemo(() => periods.filter((period) => period.status?.toLowerCase() !== "open"), [periods]);

  const isColdroomParent = selectedWarehouseId === COLDROOM_PARENT_ID;
  const selectedChildSet = useMemo(() => new Set(selectedChildWarehouseIds), [selectedChildWarehouseIds]);
  const childOpenPeriodIds = useMemo(
    () => Object.values(childOpenPeriods).filter((period): period is StockPeriod => Boolean(period)).map((period) => period.id),
    [childOpenPeriods]
  );
  const hasChildOpenPeriod = childOpenPeriodIds.length > 0;
  const canEnterCounts = isColdroomParent ? selectedChildWarehouseIds.length > 0 : Boolean(openPeriod);
  const canViewVariance = !isColdroomParent && Boolean(openPeriod);

  const combinedPeriodRows = useMemo(() => {
    const openingMap = new Map<string, PeriodCountDisplay>();
    const closingMap = new Map<string, PeriodCountDisplay>();
    periodOpeningCounts.forEach((row) => openingMap.set(makeKey(row.itemId, row.variantKey), row));
    periodClosingCounts.forEach((row) => closingMap.set(makeKey(row.itemId, row.variantKey), row));
    const keys = new Set<string>([...openingMap.keys(), ...closingMap.keys()]);

    const rows = Array.from(keys).map((key) => {
      const opening = openingMap.get(key);
      const closing = closingMap.get(key);
      const itemName = opening?.itemName || closing?.itemName || "Item";
      const variantName = opening?.variantName || closing?.variantName || "Base";
      const openingQty = opening?.qty ?? 0;
      const closingQty = closing?.qty ?? 0;
      return {
        itemName,
        variantName,
        openingQty,
        closingQty,
        varianceQty: closingQty - openingQty,
      };
    });

    return rows.sort((a, b) => {
      const nameCompare = a.itemName.toLowerCase().localeCompare(b.itemName.toLowerCase());
      if (nameCompare !== 0) return nameCompare;
      return a.variantName.toLowerCase().localeCompare(b.variantName.toLowerCase());
    });
  }, [periodOpeningCounts, periodClosingCounts]);

  const allowedVariance = useMemo(() => {
    if (!items.length) return variance;
    const allowed = new Map<string, Set<string>>();
    items.forEach((row) => {
      const set = allowed.get(row.item_id) ?? new Set<string>();
      set.add(normalizeVariantKey(row.variant_key));
      allowed.set(row.item_id, set);
    });
    return variance.filter((row) => {
      const keySet = allowed.get(row.item_id);
      if (!keySet) return false;
      return keySet.has(normalizeVariantKey(row.variant_key));
    });
  }, [items, variance]);

  const activePeriod = useMemo(() => {
    if (!activePeriodId) return openPeriod;
    if (openPeriod?.id === activePeriodId) return openPeriod;
    if (selectedPeriod?.id === activePeriodId) return selectedPeriod;
    return periods.find((period) => period.id === activePeriodId) ?? openPeriod ?? null;
  }, [activePeriodId, openPeriod, selectedPeriod, periods]);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadRolesAndOutlets = async () => {
      try {
        setRolesLoading(true);
        setError(null);

        const { data: whoami, error: whoamiError } = await supabase.rpc("whoami_roles");
        if (whoamiError) throw whoamiError;
        const record = (whoami?.[0] ?? null) as WhoamiRoles | null;
        const outletList = record?.outlets ?? [];
        const outletIds = outletList
          .map((outlet) => outlet?.outlet_id)
          .filter((outletId): outletId is string => Boolean(outletId));

        if (outletIds.length === 0) {
          const { data: fallback, error: fallbackError } = await supabase.rpc("whoami_outlet");
          if (fallbackError) throw fallbackError;
          const fallbackOutlet = fallback?.[0] as { outlet_id?: string | null } | undefined;
          if (fallbackOutlet?.outlet_id) outletIds.push(fallbackOutlet.outlet_id);
        }

        const roleDescriptors = record?.role_catalog?.length
          ? record.role_catalog
          : (record?.roles ?? []).map((value) =>
              value.includes("-") ? ({ id: value } as RoleDescriptor) : ({ slug: value } as RoleDescriptor)
            );

        if (!active) return;
        setSelectedOutletIds(outletIds);
        setHasStocktakeAccess(hasStocktakeRole(roleDescriptors));
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
        setSelectedOutletIds([]);
      } finally {
        if (active) setRolesLoading(false);
      }
    };

    loadRolesAndOutlets();

    return () => {
      active = false;
    };
  }, [status, supabase]);

  const fetchItemsForWarehouse = async (warehouseId: string) => {
    const targetWarehouseIds =
      warehouseId === COLDROOM_PARENT_ID
        ? selectedChildWarehouseIds.length
          ? selectedChildWarehouseIds
          : COLDROOM_CHILD_IDS
        : [warehouseId];
    const fallbackWarehouseIds = Array.from(
      new Set(
        warehouseId === COLDROOM_PARENT_ID || COLDROOM_CHILD_IDS.includes(warehouseId)
          ? [...targetWarehouseIds, COLDROOM_PARENT_ID]
          : targetWarehouseIds
      )
    );

    const directResponses = await Promise.all(
      targetWarehouseIds.map((id) =>
        supabase
          .from("warehouse_stock_items")
          .select("item_id,item_name,variant_key,net_units,unit_cost,item_kind,image_url,has_recipe")
          .eq("warehouse_id", id)
          .in("item_kind", ["ingredient", "finished"])
          .order("item_name", { ascending: true })
      )
    );
    directResponses.forEach((resp) => {
      if (resp.error) throw resp.error;
    });

    const combined = [...directResponses.flatMap((resp) => (resp.data as WarehouseStockItem[]) ?? [])];

    let fallbackDefaultItems: Array<{
      id: string;
      name: string | null;
      cost: number | null;
      item_kind: string | null;
      image_url: string | null;
    }> = [];

    if (products.length) {
      fallbackDefaultItems = products
        .filter((item) => {
          const kind = (item.item_kind ?? "").toLowerCase();
          return (
            Boolean(item.id) &&
            fallbackWarehouseIds.includes(item.default_warehouse_id ?? "") &&
            ["ingredient", "finished"].includes(kind)
          );
        })
        .map((item) => ({
          id: item.id,
          name: item.name,
          cost: item.cost,
          item_kind: item.item_kind ?? null,
          image_url: item.image_url ?? null,
        }));
    } else {
      const { data, error: fallbackDefaultError } = await supabase
        .from("catalog_items")
        .select("id,name,cost,item_kind,image_url")
        .eq("active", true)
        .in("item_kind", ["ingredient", "finished"])
        .in("default_warehouse_id", fallbackWarehouseIds);
      if (fallbackDefaultError) throw fallbackDefaultError;
      fallbackDefaultItems = data ?? [];
    }

    const fallbackItemsById = new Map<string, {
      id: string;
      name: string | null;
      cost: number | null;
      item_kind: string | null;
      image_url: string | null;
    }>();
    (fallbackDefaultItems ?? []).forEach((item) => {
      if (!item?.id) return;
      fallbackItemsById.set(item.id, item);
    });

    fallbackItemsById.forEach((item) => {
      combined.push({
        warehouse_id: warehouseId,
        item_id: item.id,
        item_name: item.name ?? "Item",
        variant_key: "base",
        net_units: 0,
        unit_cost: typeof item.cost === "number" ? item.cost : 0,
        item_kind: item.item_kind,
        image_url: item.image_url ?? null,
        has_recipe: false,
      });
    });

    const { data: storageHomes, error: storageHomesError } = await supabase
      .from("item_storage_homes")
      .select("item_id,normalized_variant_key,storage_warehouse_id")
      .in("storage_warehouse_id", targetWarehouseIds);
    if (storageHomesError) throw storageHomesError;

    const storageHomePairs = (storageHomes ?? [])
      .map((row) => ({
        itemId: row?.item_id,
        variantKey: normalizeVariantKey(row?.normalized_variant_key)
      }))
      .filter((row) => Boolean(row.itemId)) as Array<{ itemId: string; variantKey: string }>;

    const storageItemIds = Array.from(new Set(storageHomePairs.map((row) => row.itemId)));

    if (storageItemIds.length) {
      const storageItems = products.length
        ? products
            .filter((item) => storageItemIds.includes(item.id))
            .map((item) => ({
              id: item.id,
              name: item.name,
              cost: item.cost,
              item_kind: item.item_kind ?? null,
              image_url: item.image_url ?? null,
            }))
        : [];

      const storageItemsById = new Map<string, {
        id: string;
        name: string | null;
        cost: number | null;
        item_kind: string | null;
        image_url: string | null;
      }>();
      storageItems.forEach((item) => {
        if (!item?.id) return;
        storageItemsById.set(item.id, item);
      });

      const missingStorageIds = storageItemIds.filter((id) => !storageItemsById.has(id));
      if (missingStorageIds.length) {
        const { data: storageFallback, error: storageFallbackError } = await supabase
          .from("catalog_items")
          .select("id,name,cost,item_kind,image_url")
          .eq("active", true)
          .in("item_kind", ["ingredient", "finished"])
          .in("id", missingStorageIds);
        if (storageFallbackError) throw storageFallbackError;
        (storageFallback ?? []).forEach((item) => {
          if (!item?.id) return;
          storageItemsById.set(item.id, item);
        });
      }

      storageHomePairs.forEach((pair) => {
        const item = storageItemsById.get(pair.itemId);
        if (!item) return;
        combined.push({
          warehouse_id: warehouseId,
          item_id: item.id,
          item_name: item.name ?? "Item",
          variant_key: pair.variantKey,
          net_units: 0,
          unit_cost: typeof item.cost === "number" ? item.cost : 0,
          item_kind: item.item_kind,
          image_url: item.image_url ?? null,
          has_recipe: false,
        });
      });
    }

    if (warehouseId === COLDROOM_PARENT_ID || COLDROOM_CHILD_IDS.includes(warehouseId)) {
      const storageItems = products.length
        ? products
            .filter(
              (item) =>
                item.id &&
                item.default_warehouse_id === COLDROOM_PARENT_ID &&
                (item.item_kind ?? "").toLowerCase() === "ingredient"
            )
            .map((item) => ({
              id: item.id,
              name: item.name,
              cost: item.cost,
              item_kind: item.item_kind ?? "ingredient",
              image_url: item.image_url ?? null,
            }))
        : null;

      let coldroomStorageItems = storageItems;
      if (!coldroomStorageItems) {
        const { data, error: storageError } = await supabase
          .from("catalog_items")
          .select("id,name,cost,item_kind,image_url")
          .eq("active", true)
          .eq("item_kind", "ingredient")
          .eq("default_warehouse_id", COLDROOM_PARENT_ID);
        if (storageError) throw storageError;
        coldroomStorageItems = data ?? [];
      }

      (coldroomStorageItems ?? []).forEach((item) => {
        if (!item?.id) return;
        combined.push({
          warehouse_id: warehouseId,
          item_id: item.id,
          item_name: item.name ?? "Item",
          variant_key: "base",
          net_units: 0,
          unit_cost: typeof item.cost === "number" ? item.cost : 0,
          item_kind: item.item_kind ?? "ingredient",
          image_url: item.image_url ?? null,
          has_recipe: false,
        });
      });
    }
    const deduped = new Map<string, WarehouseStockItem>();
    combined.forEach((row) => {
      const key = makeKey(row.item_id, row.variant_key);
      if (!deduped.has(key)) deduped.set(key, row);
    });

    const grouped = new Map<string, WarehouseStockItem[]>();
    Array.from(deduped.values()).forEach((row) => {
      const list = grouped.get(row.item_id) ?? [];
      list.push(row);
      grouped.set(row.item_id, list);
    });

    const display = Array.from(grouped.values())
      .map((group) => group.find((row) => normalizeVariantKey(row.variant_key) === "base") ?? group[0])
      .filter(Boolean)
      .sort((a, b) => (a.item_name ?? a.item_id).localeCompare(b.item_name ?? b.item_id));

    return { allItems: Array.from(deduped.values()), displayItems: display };
  };

  const refreshItemsForWarehouse = async (warehouseId: string) => {
    try {
      setItemsLoading(true);
      setError(null);
      const result = await fetchItemsForWarehouse(warehouseId);
      setAllItems(result.allItems);
      setItems(result.displayItems);
      if (!result.displayItems.length) {
        setError("No stocktake items found for this warehouse.");
      }
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    if (status !== "ok") return;
    if (selectedOutletIds.length === 0) {
      setWarehouses([]);
      setSelectedWarehouseId("");
      return;
    }
    let active = true;

    const loadWarehouses = async () => {
      try {
        setError(null);
        const { data: outletWarehouseRows, error: outletWarehouseError } = await supabase
          .from("outlet_warehouses")
          .select("warehouse_id")
          .in("outlet_id", selectedOutletIds)
          .eq("show_in_stocktake", true);
        if (outletWarehouseError) throw outletWarehouseError;

        const warehouseIds = Array.from(
          new Set((outletWarehouseRows ?? []).map((row) => row?.warehouse_id).filter(Boolean))
        ) as string[];

        if (!warehouseIds.length) {
          if (!active) return;
          setWarehouses([]);
          setSelectedWarehouseId("");
          return;
        }

        const { data: warehouseRows, error: warehouseError } = await supabase
          .from("warehouses")
          .select("id,name,code,active")
          .in("id", warehouseIds)
          .order("name", { ascending: true });

        if (warehouseError) throw warehouseError;
        if (!active) return;

        const filtered = (warehouseRows ?? []).filter((row) => row.active ?? true) as WarehouseOption[];
        const merged = [...filtered];
        COLDROOM_WAREHOUSES.forEach((warehouse) => {
          if (!merged.some((item) => item.id === warehouse.id)) {
            merged.push({ id: warehouse.id, name: warehouse.name, code: warehouse.code });
          }
        });
        const selectable = merged.filter((warehouse) => warehouse.id !== COLDROOM_PARENT_ID);
        setWarehouses(selectable);
        const isValidSelection =
          selectedWarehouseId && selectable.some((warehouse) => warehouse.id === selectedWarehouseId);
        if (!isValidSelection && selectable.length > 0) {
          setSelectedWarehouseId(selectable[0].id);
        }
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      }
    };

    loadWarehouses();

    return () => {
      active = false;
    };
  }, [status, selectedOutletIds, selectedWarehouseId, supabase]);

  useEffect(() => {
    if (!selectedWarehouseId) return;
    setView("dashboard");
    setActivePeriodId(null);
    setVariance([]);
    setPeriods([]);
    setPeriodOpeningCounts([]);
    setPeriodClosingCounts([]);
    setOpeningLockedKeys(new Set());
    setClosingLockedKeys(new Set());
    setLastCount(null);
    setInputError(null);
    setUnsavedKeys({});
    if (selectedWarehouseId === COLDROOM_PARENT_ID) {
      setSelectedChildWarehouseIds(COLDROOM_CHILD_IDS);
    }
    setChildOpenPeriods({});
    setChildOpeningLockedKeys({});
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadReferenceData = async () => {
      try {
        setLoading(true);
        setError(null);

        const productSelect =
          "id,name,image_url,item_kind,default_warehouse_id,consumption_uom,stocktake_uom,purchase_pack_unit,qty_decimal_places,selling_price,cost";
        const productFallback =
          "id,name,image_url,item_kind,default_warehouse_id,consumption_uom,stocktake_uom,purchase_pack_unit,selling_price,cost";

        const variantSelect =
          "id,item_id,name,image_url,consumption_uom,stocktake_uom,purchase_pack_unit,qty_decimal_places,cost,active";
        const variantFallback =
          "id,item_id,name,image_url,consumption_uom,stocktake_uom,purchase_pack_unit,cost,active";

        const productResp = await supabase
          .from("catalog_items")
          .select(productSelect)
          .eq("active", true)
          .order("name", { ascending: true });

        let productRows = productResp.data as SimpleProduct[] | null;
        if (productResp.error) {
          const message = productResp.error.message ?? "";
          if (message.includes("qty_decimal_places")) {
            const fallbackResp = await supabase
              .from("catalog_items")
              .select(productFallback)
              .eq("active", true)
              .order("name", { ascending: true });
            if (fallbackResp.error) throw fallbackResp.error;
            productRows = fallbackResp.data as SimpleProduct[] | null;
          } else {
            throw productResp.error;
          }
        }

        const variationResp = await supabase
          .from("catalog_variants")
          .select(variantSelect)
          .eq("active", true);

        let variationRows = variationResp.data as SimpleVariation[] | null;
        if (variationResp.error) {
          const message = variationResp.error.message ?? "";
          if (message.includes("qty_decimal_places")) {
            const fallbackResp = await supabase.from("catalog_variants").select(variantFallback).eq("active", true);
            if (fallbackResp.error) throw fallbackResp.error;
            variationRows = fallbackResp.data as SimpleVariation[] | null;
          } else {
            throw variationResp.error;
          }
        }

        if (!active) return;

        const productsList = productRows ?? [];
        const variationsList = variationRows ?? [];
        setProducts(productsList);
        setVariations(variationsList);

        const uomMap: Record<string, string> = {};
        const stocktakeMap: Record<string, string> = {};
        const decimalsMap: Record<string, number> = {};

        productsList.forEach((product) => {
          const uom = product.purchase_pack_unit?.trim() || product.consumption_uom?.trim() || "each";
          uomMap[product.id] = uom;
          const stocktakeUom = product.purchase_pack_unit?.trim() || product.stocktake_uom?.trim() || uom;
          stocktakeMap[product.id] = stocktakeUom;
          if (product.qty_decimal_places != null) {
            decimalsMap[makeKey(product.id, "base")] = product.qty_decimal_places;
          }
        });

        variationsList.forEach((variation) => {
          if (variation.qty_decimal_places != null) {
            decimalsMap[makeKey(variation.item_id, variation.id)] = variation.qty_decimal_places;
          }
        });

        setProductUoms(uomMap);
        setStocktakeUoms(stocktakeMap);
        setQtyDecimals(decimalsMap);
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    };

    loadReferenceData();

    return () => {
      active = false;
    };
  }, [status, supabase]);

  useEffect(() => {
    if (status !== "ok" || !selectedWarehouseId) return;
    let active = true;

    const fetchOpenPeriod = async () => {
      try {
        if (selectedWarehouseId === COLDROOM_PARENT_ID) {
          setOpenPeriod(null);
          await loadChildPeriods(selectedChildWarehouseIds);
          return;
        }
        const { data, error: periodError } = await supabase
          .from("warehouse_stock_periods")
          .select("id,warehouse_id,outlet_id,status,opened_at,closed_at,note,stocktake_number")
          .eq("warehouse_id", selectedWarehouseId)
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1);
        if (periodError) throw periodError;
        if (!active) return;
        setOpenPeriod((data ?? [])[0] ?? null);
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      }
    };

    fetchOpenPeriod();
    (async () => {
      try {
        setItemsLoading(true);
        setError(null);
        const result = await fetchItemsForWarehouse(selectedWarehouseId);
        if (!active) return;
        setAllItems(result.allItems);
        setItems(result.displayItems);
        if (!result.displayItems.length) {
          setError("No stocktake items found for this warehouse.");
        }
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      } finally {
        if (active) setItemsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [status, selectedWarehouseId, selectedChildWarehouseIds, supabase]);

  useEffect(() => {
    if (status !== "ok" || !isColdroomParent) return;
    loadChildPeriods(selectedChildWarehouseIds).catch((err) => {
      setError(toErrorMessage(err));
    });
  }, [status, isColdroomParent, selectedChildWarehouseIds]);

  useEffect(() => {
    if (!isColdroomParent) return;
    setUnsavedKeys((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        const [childId] = key.split("::");
        if (childId && COLDROOM_CHILD_IDS.includes(childId) && !selectedChildSet.has(childId)) {
          delete next[key];
        }
      });
      return next;
    });
  }, [isColdroomParent, selectedChildSet]);


  const loadPeriods = async (warehouseId: string) => {
    try {
      setPeriodsLoading(true);
      setPeriodsError(null);
      const { data, error: periodsError } = await supabase
        .from("warehouse_stock_periods")
        .select("id,warehouse_id,outlet_id,status,opened_at,closed_at,note,stocktake_number")
        .eq("warehouse_id", warehouseId)
        .order("opened_at", { ascending: false })
        .limit(30);
      if (periodsError) throw periodsError;
      setPeriods((data as StockPeriod[]) ?? []);
    } catch (err) {
      setPeriodsError(toErrorMessage(err));
    } finally {
      setPeriodsLoading(false);
    }
  };

  async function loadChildPeriods(childIds: string[]) {
    if (!childIds.length) {
      setChildOpenPeriods({});
      return;
    }
    const { data, error } = await supabase
      .from("warehouse_stock_periods")
      .select("id,warehouse_id,outlet_id,status,opened_at,closed_at,note,stocktake_number")
      .in("warehouse_id", childIds)
      .eq("status", "open")
      .order("opened_at", { ascending: false });
    if (error) throw error;
    const map: Record<string, StockPeriod | null> = {};
    childIds.forEach((id) => {
      map[id] = null;
    });
    (data as StockPeriod[] | null | undefined)?.forEach((period) => {
      if (!period?.warehouse_id || map[period.warehouse_id]) return;
      map[period.warehouse_id] = period;
    });
    setChildOpenPeriods(map);
  }

  const loadChildCountsForDialog = async (
    rows: WarehouseStockItem[],
    periodOverride?: Record<string, StockPeriod | null>
  ) => {
    if (!rows.length || !selectedChildWarehouseIds.length) {
      setChildOpeningLockedKeys({});
      return null;
    }

    const childPeriods = periodOverride ?? childOpenPeriods;
    const periodEntries = Object.entries(childPeriods)
      .filter(([childId, period]) => selectedChildSet.has(childId) && period?.id)
      .map(([childId, period]) => ({ childId, periodId: period!.id }));

    if (!periodEntries.length) {
      setChildOpeningLockedKeys({});
      return null;
    }

    const periodIds = periodEntries.map((entry) => entry.periodId);
    const itemIds = Array.from(new Set(rows.map((row) => row.item_id)));

    const { data, error } = await supabase
      .from("warehouse_stock_counts")
      .select("period_id,item_id,variant_key,counted_qty,kind,counted_at")
      .in("period_id", periodIds)
      .in("item_id", itemIds);
    if (error) throw error;

    const periodToChild = new Map(periodEntries.map((entry) => [entry.periodId, entry.childId]));
    const openingMap: Record<string, Record<string, number>> = {};
    const closingMap: Record<string, Record<string, number>> = {};
    const lockedMap: Record<string, Set<string>> = {};

    selectedChildWarehouseIds.forEach((childId) => {
      openingMap[childId] = {};
      closingMap[childId] = {};
      lockedMap[childId] = new Set();
    });

    (data as StockCountRow[] | null | undefined)?.forEach((row) => {
      const childId = periodToChild.get(row.period_id ?? "");
      if (!childId) return;
      const key = makeKey(row.item_id, row.variant_key);
      if (row.kind === "opening") {
        openingMap[childId][key] = row.counted_qty ?? 0;
        lockedMap[childId].add(key);
      }
      if (row.kind === "closing") {
        closingMap[childId][key] = row.counted_qty ?? 0;
      }
    });

    setChildOpeningLockedKeys(lockedMap);
    return { openingMap, closingMap, lockedMap };
  };

  const loadPeriodCounts = async (periodId: string) => {
    if (!periodId) return;
    try {
      setPeriodCountsLoading(true);
      setPeriodCountsError(null);

      const { data: periodRows, error: periodError } = await supabase
        .from("warehouse_stock_periods")
        .select("id,warehouse_id,outlet_id,status,opened_at,closed_at,note,stocktake_number")
        .eq("id", periodId)
        .limit(1);
      if (periodError) throw periodError;
      const period = (periodRows ?? [])[0] ?? null;
      setSelectedPeriod(period);

      const { data: openingRows, error: openingError } = await supabase
        .from("warehouse_stock_counts")
        .select("item_id,variant_key,counted_qty,kind,counted_at")
        .eq("period_id", periodId)
        .eq("kind", "opening");
      if (openingError) throw openingError;

      const { data: closingRows, error: closingError } = await supabase
        .from("warehouse_stock_counts")
        .select("item_id,variant_key,counted_qty,kind,counted_at")
        .eq("period_id", periodId)
        .eq("kind", "closing");
      if (closingError) throw closingError;

      const itemNameMap = new Map<string, string>();
      products.forEach((product) => {
        if (product.id) itemNameMap.set(product.id, product.name ?? "Item");
      });

      const formatVariantName = (itemId: string, keyRaw?: string | null) => {
        const key = normalizeVariantKey(keyRaw);
        if (key === "base") return "Base";
        return variantLabelMap.get(key) ?? key;
      };

      const toDisplay = (rows: StockCountRow[], kind: string): PeriodCountDisplay[] =>
        rows.map((row) => {
          const variantKey = normalizeVariantKey(row.variant_key);
          return {
            itemId: row.item_id,
            itemName: itemNameMap.get(row.item_id) ?? row.item_id,
            variantKey,
            variantName: formatVariantName(row.item_id, variantKey),
            qty: row.counted_qty ?? 0,
            kind,
          };
        });

      const openingCounts = toDisplay((openingRows as StockCountRow[]) ?? [], "opening");
      const closingCounts = toDisplay((closingRows as StockCountRow[]) ?? [], "closing");

      setPeriodOpeningCounts(openingCounts);
      setPeriodClosingCounts(closingCounts);
      setOpeningLockedKeys(new Set(openingCounts.map((row) => makeKey(row.itemId, row.variantKey))));
      setClosingLockedKeys(new Set(closingCounts.map((row) => makeKey(row.itemId, row.variantKey))));

      if (period?.status === "open" && openingCounts.length === 0) {
        await importPreviousClosingIntoOpening(period.id, period.warehouse_id, false, true);
      }
    } catch (err) {
      setPeriodCountsError(toErrorMessage(err));
    } finally {
      setPeriodCountsLoading(false);
    }
  };

  const loadVarianceFor = async (periodId: string) => {
    if (!periodId) return;
    try {
      setVarianceLoading(true);
      setError(null);

      const response = await fetch(`/api/stocktake-variance?period_id=${periodId}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load variance data");
      }

      const payload = (await response.json()) as VarianceApiResponse;
      const includeSales = payload.include_sales !== false;
      setVarianceIncludeSales(includeSales);
      const rows = (payload.rows ?? []).map((row) => {
        const transferQty = row.transfer_qty ?? 0;
        const damageQty = row.damage_qty ?? 0;
        const salesQty = includeSales ? (row.sales_qty ?? 0) : 0;
        return {
          period_id: periodId,
          warehouse_id: payload.period.warehouse_id,
          outlet_id: null,
          item_id: row.item_id ?? "",
          item_name: row.item_name ?? null,
          variant_key: row.variant_key ?? null,
          opening_qty: row.opening_qty ?? 0,
          movement_qty: transferQty + damageQty + salesQty,
          closing_qty: row.closing_qty ?? 0,
          expected_qty: row.expected_qty ?? 0,
          variance_qty: row.variance_qty ?? 0,
          unit_cost: row.unit_cost ?? null,
          variance_cost: row.variance_cost ?? null,
        } as VarianceRow;
      });
      setVariance(rows);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setVarianceLoading(false);
    }
  };

  const importPreviousClosingIntoOpening = async (
    periodId: string,
    warehouseId: string,
    includeZeros: boolean,
    auto: boolean
  ) => {
    if (auto) {
      if (autoImportAttempted.current.has(periodId)) return;
      autoImportAttempted.current.add(periodId);
    }
    try {
      setPeriodCountsLoading(true);
      setPeriodCountsError(null);

      const { data: currentOpening } = await supabase
        .from("warehouse_stock_counts")
        .select("item_id,variant_key")
        .eq("period_id", periodId)
        .eq("kind", "opening");

      if (auto && currentOpening && currentOpening.length > 0) {
        setPeriodCountsLoading(false);
        return;
      }

      const { data: periodRows, error: periodError } = await supabase
        .from("warehouse_stock_periods")
        .select("id,warehouse_id,outlet_id,status,opened_at,closed_at,note,stocktake_number")
        .eq("warehouse_id", warehouseId)
        .order("opened_at", { ascending: false })
        .limit(30);
      if (periodError) throw periodError;

      const previous = (periodRows as StockPeriod[] | null)?.find(
        (row) => row.status === "closed" && row.id !== periodId
      );
      if (!previous) {
        setPeriodCountsError("No previous closed period found to import.");
        return;
      }

      const { data: closingCounts, error: closingError } = await supabase
        .from("warehouse_stock_counts")
        .select("item_id,variant_key,counted_qty")
        .eq("period_id", previous.id)
        .eq("kind", "closing");
      if (closingError) throw closingError;

      const baseItems = includeZeros
        ? allItems.length
          ? allItems
          : ((await supabase
              .rpc("list_warehouse_items", { p_warehouse_id: warehouseId, p_outlet_id: null, p_search: null })
              .then((res) => res.data)) as WarehouseStockItem[] | null) ?? []
        : [];

      let hadFailure = false;
      const seededKeys = new Set<string>();

      for (const row of (closingCounts as StockCountRow[]) ?? []) {
        const variantKey = normalizeVariantKey(row.variant_key);
        const key = makeKey(row.item_id, variantKey);
        try {
          const { error: recordError } = await supabase.rpc("record_stock_count", {
            p_period_id: periodId,
            p_item_id: row.item_id,
            p_qty: row.counted_qty,
            p_variant_key: variantKey,
            p_kind: "opening",
            p_context: { auto_seed: String(auto), from_period: previous.id },
          });
          if (recordError) throw recordError;
        } catch (err) {
          hadFailure = true;
        }
        seededKeys.add(key);
      }

      if (includeZeros) {
        for (const item of baseItems) {
          const variantKey = normalizeVariantKey(item.variant_key);
          const key = makeKey(item.item_id, variantKey);
          if (seededKeys.has(key)) continue;
          try {
            const { error: recordError } = await supabase.rpc("record_stock_count", {
              p_period_id: periodId,
              p_item_id: item.item_id,
              p_qty: 0,
              p_variant_key: variantKey,
              p_kind: "opening",
              p_context: { auto_seed: String(auto), from_period: previous.id },
            });
            if (recordError) throw recordError;
          } catch (err) {
            hadFailure = true;
          }
          seededKeys.add(key);
        }
      }

      if (hadFailure) {
        setPeriodCountsError("Some opening counts failed to import.");
      }
      await loadPeriodCounts(periodId);
    } catch (err) {
      setPeriodCountsError(toErrorMessage(err));
    } finally {
      setPeriodCountsLoading(false);
    }
  };

  const handleStartStocktake = async () => {
    if (!selectedWarehouseId || readOnly || !hasStocktakeAccess || isColdroomParent) return;
    try {
      setLoading(true);
      setError(null);
      const { data, error: startError } = await supabase.rpc("start_stock_period", {
        p_warehouse_id: selectedWarehouseId,
        p_note: note.trim() || null,
      });
      if (startError) throw startError;
      const period = (Array.isArray(data) ? data[0] : data) as StockPeriod | null;
      if (!period) throw new Error("start_stock_period returned no period");
      setOpenPeriod(period);
      const openedAt = period.opened_at || new Date().toISOString();
      await supabase.rpc("set_pos_sync_opening_for_warehouse", {
        p_warehouse_id: period.warehouse_id,
        p_opened: openedAt,
      });
      setNote("");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClosePeriod = async () => {
    if (!openPeriod || readOnly || !hasStocktakeAccess) return;
    try {
      setLoading(true);
      setError(null);

      const { data: closedData, error: closeError } = await supabase.rpc("close_stock_period", {
        p_period_id: openPeriod.id,
      });
      if (closeError) throw closeError;
      const closedPeriod = (Array.isArray(closedData) ? closedData[0] : closedData) as StockPeriod | null;
      if (!closedPeriod) throw new Error("close_stock_period returned no period");

      const closedAt = closedPeriod.closed_at || new Date().toISOString();
      await supabase.rpc("set_pos_sync_cutoff_for_warehouse", {
        p_warehouse_id: closedPeriod.warehouse_id,
        p_cutoff: closedAt,
      });

      const { data: closingCounts, error: closingError } = await supabase
        .from("warehouse_stock_counts")
        .select("item_id,variant_key,counted_qty")
        .eq("period_id", closedPeriod.id)
        .eq("kind", "closing");
      if (closingError) throw closingError;

      const { data: newPeriodData, error: startError } = await supabase.rpc("start_stock_period", {
        p_warehouse_id: closedPeriod.warehouse_id,
        p_note: `Auto-opened from ${closedPeriod.stocktake_number || closedPeriod.id.slice(0, 8)}`,
      });
      if (startError) throw startError;
      const newPeriod = (Array.isArray(newPeriodData) ? newPeriodData[0] : newPeriodData) as StockPeriod | null;
      if (!newPeriod) throw new Error("start_stock_period returned no period");
      setOpenPeriod(newPeriod);

      const openedAt = newPeriod.opened_at || new Date().toISOString();
      await supabase.rpc("set_pos_sync_opening_for_warehouse", {
        p_warehouse_id: newPeriod.warehouse_id,
        p_opened: openedAt,
      });

      let hadSeedFailure = false;
      for (const row of (closingCounts as StockCountRow[]) ?? []) {
        const variantKey = normalizeVariantKey(row.variant_key);
        const { error: seedError } = await supabase.rpc("record_stock_count", {
          p_period_id: newPeriod.id,
          p_item_id: row.item_id,
          p_qty: row.counted_qty,
          p_variant_key: variantKey,
          p_kind: "opening",
          p_context: { auto_seed: "true", from_period: closedPeriod.id },
        });
        if (seedError) hadSeedFailure = true;
      }

      if (hadSeedFailure) {
        setError("New period opened, but some opening counts failed to copy.");
      }

      await loadPeriodCounts(openPeriod.id);
      await loadPeriods(closedPeriod.warehouse_id);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const resolveDecimals = (itemId: string, variantKey: string | null, uom: string) => {
    const key = makeKey(itemId, variantKey);
    const baseKey = makeKey(itemId, "base");
    return qtyDecimals[key] ?? qtyDecimals[baseKey] ?? defaultDecimalsForUom(uom);
  };

  const buildBatchForRows = (rows: WarehouseStockItem[]): CountInput[] | null => {
    let hadError = false;
    const batch: CountInput[] = [];
    const seen = new Set<string>();

    rows.forEach((row) => {
      const variantKey = normalizeVariantKey(row.variant_key);
      const key = makeKey(row.item_id, variantKey);
      if (seen.has(key)) return;
      seen.add(key);

      const openingLocked = openingLockedKeys.has(key);
      const entryMode: "opening" | "closing" = openingLocked ? "closing" : "opening";

      const rawText = dialogQty[key]?.trim() ?? "";
      const parsed = rawText === "" ? 0 : Number(rawText);
      if (Number.isNaN(parsed) || parsed < 0) {
        hadError = true;
        return;
      }

      const uom =
        variantStocktakeUomMap.get(variantKey) ||
        stocktakeUoms[row.item_id] ||
        variantUomMap.get(variantKey) ||
        productUoms[row.item_id] ||
        "each";

      const decimals = resolveDecimals(row.item_id, variantKey, uom);
      const factor = Math.pow(10, Math.min(Math.max(decimals, 0), 6));
      const rounded = Math.round(parsed * factor) / factor;

      batch.push({ itemId: row.item_id, qty: rounded, variantKey, kind: entryMode });
    });

    if (hadError) return null;
    return batch;
  };

  const buildBatchForRowsWithChildren = (rows: WarehouseStockItem[]): Array<CountInput & { childId: string }> | null => {
    let hadError = false;
    const batch: Array<CountInput & { childId: string }> = [];

    rows.forEach((row) => {
      const variantKey = normalizeVariantKey(row.variant_key);
      const key = makeKey(row.item_id, variantKey);

      const uom =
        variantStocktakeUomMap.get(variantKey) ||
        stocktakeUoms[row.item_id] ||
        variantUomMap.get(variantKey) ||
        productUoms[row.item_id] ||
        "each";
      const decimals = resolveDecimals(row.item_id, variantKey, uom);
      const factor = Math.pow(10, Math.min(Math.max(decimals, 0), 6));

      selectedChildWarehouseIds.forEach((childId) => {
        if (!selectedChildSet.has(childId)) return;
        const childKey = makeChildKey(childId, row.item_id, variantKey);
        if (!unsavedKeys[childKey]) return;
        const rawText = dialogQty[childKey]?.trim() ?? "";
        const parsed = rawText === "" ? 0 : Number(rawText);
        if (Number.isNaN(parsed) || parsed < 0) {
          hadError = true;
          return;
        }
        const rounded = Math.round(parsed * factor) / factor;
        const openingLocked = childOpeningLockedKeys[childId]?.has(key) ?? false;
        const entryMode: "opening" | "closing" = openingLocked ? "closing" : "opening";
        batch.push({ itemId: row.item_id, qty: rounded, variantKey, kind: entryMode, childId });
      });
    });

    if (hadError) return null;
    return batch;
  };

  const recordCountsBatch = async (entries: CountInput[]) => {
    if (!entries.length || !activePeriodId || readOnly || !hasStocktakeAccess || !activePeriodIsOpen) return;
    setLoading(true);
    setInputError(null);

    let hadFailure = false;
    const savedKeys: string[] = [];
    let lastSaved: { kind: string; counted_qty: number } | null = null;

    for (const entry of entries) {
      try {
        const { data, error: recordError } = await supabase.rpc("record_stock_count", {
          p_period_id: activePeriodId,
          p_item_id: entry.itemId,
          p_qty: entry.qty,
          p_variant_key: entry.variantKey,
          p_kind: entry.kind,
        });
        if (recordError) throw recordError;
        lastSaved = { kind: entry.kind, counted_qty: entry.qty };
        savedKeys.push(makeKey(entry.itemId, entry.variantKey));
      } catch (err) {
        hadFailure = true;
      }
    }

    setLastCount(lastSaved);
    if (hadFailure) {
      setInputError("Some counts failed to save.");
    }

    if (savedKeys.length) {
      setUnsavedKeys((prev) => {
        const next = { ...prev };
        savedKeys.forEach((key) => delete next[key]);
        return next;
      });
    }

    if (activePeriodId) {
      await loadPeriodCounts(activePeriodId);
      if (selectedWarehouseId) {
        await refreshItemsForWarehouse(selectedWarehouseId);
      }
    }

    setLoading(false);
  };

  const ensureChildPeriod = async (childId: string): Promise<StockPeriod | null> => {
    const existing = childOpenPeriods[childId];
    if (existing?.id) return existing;
    try {
      const { data, error } = await supabase.rpc("start_stock_period", {
        p_warehouse_id: childId,
        p_note: `Auto-opened from ${COLDROOM_PARENT_ID}`,
      });
      if (error) throw error;
      const period = (Array.isArray(data) ? data[0] : data) as StockPeriod | null;
      if (!period?.id) return null;
      setChildOpenPeriods((prev) => ({ ...prev, [childId]: period }));
      return period;
    } catch (err) {
      setInputError(toErrorMessage(err));
      return null;
    }
  };

  const recordCountsBatchForChildren = async (
    entries: Array<CountInput & { childId: string }>,
    dialogRows: WarehouseStockItem[]
  ) => {
    if (!entries.length || readOnly || !hasStocktakeAccess) return;
    setLoading(true);
    setInputError(null);

    let hadFailure = false;
    let lastSaved: { kind: string; counted_qty: number } | null = null;
    const savedKeys: string[] = [];
    const periodMap: Record<string, StockPeriod | null> = { ...childOpenPeriods };

    for (const entry of entries) {
      let period = periodMap[entry.childId] ?? null;
      if (!period?.id) {
        period = await ensureChildPeriod(entry.childId);
      }
      if (!period?.id) {
        hadFailure = true;
        continue;
      }
      periodMap[entry.childId] = period;
      try {
        const { error: recordError } = await supabase.rpc("record_stock_count", {
          p_period_id: period.id,
          p_item_id: entry.itemId,
          p_qty: entry.qty,
          p_variant_key: entry.variantKey,
          p_kind: entry.kind,
        });
        if (recordError) throw recordError;
        lastSaved = { kind: entry.kind, counted_qty: entry.qty };
        savedKeys.push(makeChildKey(entry.childId, entry.itemId, entry.variantKey));
      } catch (err) {
        hadFailure = true;
      }
    }

    setLastCount(lastSaved);
    if (hadFailure) {
      setInputError("Some counts failed to save.");
    }

    if (savedKeys.length) {
      setUnsavedKeys((prev) => {
        const next = { ...prev };
        savedKeys.forEach((key) => delete next[key]);
        return next;
      });
    }

    setChildOpenPeriods(periodMap);

    if (dialogRows.length) {
      await loadChildCountsForDialog(dialogRows, periodMap);
    }

    setLoading(false);
  };

  const loadRecipeIngredients = async (itemId: string, variantKey: string) => {
    const key = makeKey(itemId, variantKey);
    if (recipeIngredients[key] || recipeIngredientsLoading.has(key)) return;

    setRecipeIngredientsLoading((prev) => new Set([...prev, key]));

    try {
      const { data: rows, error: recipeError } = await supabase
        .from("recipes")
        .select("ingredient_item_id,finished_variant_key,active")
        .eq("finished_item_id", itemId)
        .eq("active", true);
      if (recipeError) throw recipeError;
      const normalizedVariant = normalizeVariantKey(variantKey);
      const recipeRows =
        (rows as Array<{ ingredient_item_id?: string | null; finished_variant_key?: string | null }>) ?? [];
      const exact = recipeRows
        .filter((row) => normalizeVariantKey(row.finished_variant_key) === normalizedVariant)
        .map((row) => row.ingredient_item_id)
        .filter((id): id is string => Boolean(id));
      const fallback = recipeRows
        .map((row) => row.ingredient_item_id)
        .filter((id): id is string => Boolean(id));
      setRecipeIngredients((prev) => ({ ...prev, [key]: (exact.length ? exact : fallback) as string[] }));
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setRecipeIngredientsLoading((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const recipeTargets = useMemo(() => {
    return filteredDisplayItems
      .filter((row) => row.has_recipe && (row.item_kind ?? "").toLowerCase() !== "ingredient")
      .map((row) => row.item_id);
  }, [filteredDisplayItems]);

  useEffect(() => {
    recipeTargets.forEach((itemId) => {
      const key = makeKey(itemId, "base");
      if (!recipeIngredients[key] && !recipeIngredientsLoading.has(key)) {
        loadRecipeIngredients(itemId, "base");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeTargets, recipeIngredients, recipeIngredientsLoading]);

  const handleDialogClose = (displayRows: WarehouseStockItem[]) => {
    const dialogKeys = isColdroomParent
      ? displayRows.flatMap((row) =>
          selectedChildWarehouseIds.map((childId) => makeChildKey(childId, row.item_id, row.variant_key))
        )
      : displayRows.map((row) => makeKey(row.item_id, row.variant_key));
    const hasUnsaved = dialogKeys.some((key) => unsavedKeys[key]);
    if (hasUnsaved) {
      setConfirmState({
        title: "Unsaved counts",
        message: "You have unsaved counts. Leave without saving?",
        onConfirm: () => setDialogOpen(false),
      });
    } else {
      setDialogOpen(false);
    }
  };

  const handleLeaveCounts = () => {
    const hasUnsaved = Object.keys(unsavedKeys).length > 0;
    if (hasUnsaved) {
      setConfirmState({
        title: "Unsaved counts",
        message: "You have unsaved counts. Leave without saving?",
        onConfirm: () => setView("dashboard"),
      });
    } else {
      setView("dashboard");
    }
  };

  const handleConfirmClose = () => {
    const action = confirmState?.onConfirm;
    setConfirmState(null);
    action?.();
  };

  const downloadVariancePdf = async (period: StockPeriod) => {
    try {
      setPdfBusyId(period.id);
      setError(null);
      const response = await fetch(`/api/stocktake-variance?period_id=${period.id}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load variance data");
      }

      const payload = (await response.json()) as VarianceApiResponse;
      const apiRows = payload.rows ?? [];
      const openedAt = payload.period.opened_at;
      const closedAt = payload.period.closed_at;
      const includeSales = payload.include_sales !== false;

      const logoDataUrl = await loadLogoDataUrl();
      const warehouseName =
        warehouseNameMap.get(period.warehouse_id)?.name || warehouseNameMap.get(period.warehouse_id)?.code || "--";
      const periodLabel = payload.period.stocktake_number || period.id.slice(0, 8);
      const dateRange = `${formatStamp(openedAt)} to ${formatStamp(closedAt)}`;
      const periodText = `${periodLabel} | ${dateRange}`;

      const filteredRows = apiRows.filter((row) => {
        const kind = (row.item_kind ?? "").toLowerCase();
        const hasVariant = row.is_variant ?? false;
        const variantKey = (row.variant_key ?? "").trim().toLowerCase();
        const itemKey = (row.item_id ?? "").trim().toLowerCase();
        const label = (row.variant_label ?? "").trim().toLowerCase();
        const itemName = (row.item_name ?? "").trim().toLowerCase();
        const isBaseKey = !variantKey || variantKey === "base" || (itemKey && variantKey === itemKey);
        const isBaseLabel = !!itemName && label === itemName;
        return kind === "ingredient" || kind === "raw" || (hasVariant && !isBaseKey && !isBaseLabel);
      });

      const html = buildStocktakeVariancePdfHtml({
        warehouseText: warehouseName,
        periodText,
        logoDataUrl,
        includeSales,
        rows: filteredRows.map((row) => ({
          variant_label: row.is_variant
            ? row.variant_name ?? row.variant_label ?? row.item_name ?? ""
            : row.variant_label ?? row.item_name ?? "",
          opening_qty: row.opening_qty ?? 0,
          transfer_qty: Math.abs(row.transfer_qty ?? 0),
          damage_qty: Math.abs(row.damage_qty ?? 0),
          sales_qty: includeSales ? Math.abs(row.sales_qty ?? 0) : 0,
          closing_qty: row.closing_qty ?? 0,
          expected_qty: row.expected_qty ?? 0,
          variance_qty: row.variance_qty ?? 0,
          variant_amount: row.variant_amount ?? row.variance_cost ?? 0,
        })),
      });

      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.setAttribute("aria-hidden", "true");
      document.body.appendChild(frame);

      const doc = frame.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(frame);
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      const cleanup = () => {
        if (frame.parentNode) {
          frame.parentNode.removeChild(frame);
        }
      };

      setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(cleanup, 1000);
      }, 400);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setPdfBusyId(null);
    }
  };

  const dialogRows = allItemsByItemId.get(dialogItemId) ?? [];
  const dialogBaseRow =
    dialogRows.find((row) => normalizeVariantKey(row.variant_key) === "base") ?? dialogRows[0] ?? null;
  const dialogKind = (dialogItemKind ?? dialogBaseRow?.item_kind ?? "").toLowerCase();
  const dialogVariantKey = normalizeVariantKey(dialogBaseRow?.variant_key);
  const dialogRecipeKey = makeKey(dialogItemId, dialogVariantKey);
  const dialogIsIngredient = dialogKind === "ingredient";
  const dialogHasRecipe = !dialogIsIngredient && dialogBaseRow?.has_recipe;
  const dialogIngredientIds = recipeIngredients[dialogRecipeKey] ?? [];
  const dialogRecipeLoading = recipeIngredientsLoading.has(dialogRecipeKey);
  const dialogIngredientRows = dialogHasRecipe
    ? dialogIngredientIds
        .map((id) => {
          const rows = allItemsByItemId.get(id) ?? [];
          return rows.find((row) => normalizeVariantKey(row.variant_key) === "base") ?? rows[0] ?? null;
        })
        .filter(Boolean)
    : [];

  const dialogVariantRowsExisting = dialogRows.filter((row) => normalizeVariantKey(row.variant_key) !== "base");
  const dialogVariantRowsFromCatalog = (variationsByItemId.get(dialogItemId) ?? [])
    .map((variation) => {
      const key = normalizeVariantKey(variation.id);
      if (!key || key === "base") return null;
      return {
        item_id: dialogItemId,
        item_name: dialogBaseRow?.item_name ?? null,
        variant_key: key,
        net_units: null,
        unit_cost: dialogBaseRow?.unit_cost ?? null,
        item_kind: dialogBaseRow?.item_kind ?? null,
        image_url: dialogBaseRow?.image_url ?? null,
        has_recipe: dialogBaseRow?.has_recipe ?? null,
      } as WarehouseStockItem;
    })
    .filter(Boolean) as WarehouseStockItem[];

  const dialogVariantRows = [...dialogVariantRowsExisting, ...dialogVariantRowsFromCatalog].filter((row, index, arr) => {
    const key = normalizeVariantKey(row.variant_key);
    return arr.findIndex((candidate) => normalizeVariantKey(candidate.variant_key) === key) === index;
  });

  const dialogHasIngredientVariants = dialogIsIngredient && dialogVariantRows.length > 0;
  const dialogDisplayRows = dialogHasRecipe
    ? dialogIngredientRows
    : dialogHasIngredientVariants
      ? dialogVariantRows
      : dialogIsIngredient
        ? dialogBaseRow
          ? [dialogBaseRow]
          : []
        : dialogVariantRows.length > 0
          ? dialogVariantRows
          : dialogBaseRow
            ? [dialogBaseRow]
            : [];

  const hasUnsaved = Object.keys(unsavedKeys).length > 0;
  const canClosePeriod = Boolean(openPeriod && activePeriodId === openPeriod.id);
  const activePeriodIsOpen = isColdroomParent ? hasChildOpenPeriod : activePeriod?.status === "open";

  useEffect(() => {
    if (!dialogOpen || !dialogDisplayRows.length) return;

    if (dialogHasRecipe && !dialogRecipeLoading && !dialogIngredientIds.length) {
      loadRecipeIngredients(dialogItemId, dialogVariantKey);
    }
    if (isColdroomParent) {
      (async () => {
        await loadChildCountsForDialog(dialogDisplayRows, childOpenPeriods);
        setDialogQty((prev) => {
          let changed = false;
          const next = { ...prev };
          dialogDisplayRows.forEach((row) => {
            const variantKey = normalizeVariantKey(row.variant_key);

            selectedChildWarehouseIds.forEach((childId) => {
              const childKey = makeChildKey(childId, row.item_id, variantKey);
              if (unsavedKeys[childKey]) return;
              // NOTE: Keep dialog inputs empty on open; do not prefill with prior counts.
              if (next[childKey] !== "") {
                next[childKey] = "";
                changed = true;
              }
            });
          });
          return changed ? next : prev;
        });
      })();
      return;
    }

    setDialogQty((prev) => {
      let changed = false;
      const next = { ...prev };
      dialogDisplayRows.forEach((row) => {
        const key = makeKey(row.item_id, row.variant_key);
        if (unsavedKeys[key]) return;
        // NOTE: Keep dialog inputs empty on open; do not prefill with prior counts.
        if (next[key] !== "") {
          next[key] = "";
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dialogOpen,
    dialogDisplayRows,
    dialogHasRecipe,
    dialogRecipeLoading,
    dialogIngredientIds.length,
    isColdroomParent,
    selectedChildWarehouseIds,
    unsavedKeys
  ]);

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Warehouse Stocktake</h1>
            <p className={styles.subtitle}>
              Count, close, and review stocktake periods with the same flow as the Stocktakes app.
            </p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={handleBackOne} className={styles.backButton}>
              Back
            </button>
            <button onClick={handleBack} className={styles.backButton}>
              Back to Dashboard
            </button>
          </div>
        </header>

        <section className={styles.tabBar}>
          {([
            { id: "dashboard", label: "Dashboard" },
            { id: "periods", label: "Periods" },
            { id: "counts", label: "Counts" },
            { id: "variance", label: "Variance" },
          ] as Array<{ id: ViewMode; label: string }>).map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tabButton} ${view === tab.id ? styles.tabButtonActive : ""}`}
              disabled={(tab.id === "counts" && !canEnterCounts) || (tab.id === "variance" && !canViewVariance)}
              onClick={() => {
                setView(tab.id);
                if (tab.id === "periods" && selectedWarehouseId) loadPeriods(selectedWarehouseId);
                if (tab.id === "counts") {
                  if (isColdroomParent) {
                    setActivePeriodId(null);
                    loadChildPeriods(selectedChildWarehouseIds);
                  } else if (openPeriod) {
                    setActivePeriodId(openPeriod.id);
                    loadPeriodCounts(openPeriod.id);
                  }
                }
                if (tab.id === "variance" && openPeriod) {
                  if (!isColdroomParent) {
                    setActivePeriodId(openPeriod.id);
                    loadVarianceFor(openPeriod.id);
                  }
                }
              }}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </section>

        {error && <p className={styles.errorBanner}>{error}</p>}
        {!hasStocktakeAccess && (
          <p className={styles.warningBanner}>
            Stocktake role required. Ask an admin to assign the Stocktake role to your account.
          </p>
        )}

        {rolesLoading && <p className={styles.loadingTag}>Checking access...</p>}

        {view === "dashboard" && (
          <section className={styles.gridTwo}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Warehouse</h2>
                <span className={styles.panelNote}>Stocktake is warehouse-level.</span>
              </div>
              <div className={styles.panelBody}>
                <label className={styles.fieldLabel}>
                  Select warehouse
                  <select
                    className={styles.select}
                    value={selectedWarehouseId}
                    onChange={(event) => setSelectedWarehouseId(event.target.value)}
                    disabled={warehouses.length === 0}
                  >
                    {warehouses.length === 0 ? (
                      <option value="">No warehouses found</option>
                    ) : (
                      warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name || warehouse.code || warehouse.id}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <p className={styles.helperText}>
                  Flow: enter opening counts, process transfers and damages, then enter closing counts.
                </p>
                {isColdroomParent && (
                  <p className={styles.helperText}>
                    Coldroom parent uses child warehouse stocktakes. Select children and enter counts in the Counts tab.
                  </p>
                )}
                <label className={styles.fieldLabel}>
                  Note (optional)
                  <textarea
                    className={styles.textarea}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Optional note for the stocktake period"
                    rows={2}
                  />
                </label>
                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleStartStocktake}
                    disabled={
                      loading ||
                      !selectedWarehouseId ||
                      readOnly ||
                      !hasStocktakeAccess ||
                      !!openPeriod ||
                      isColdroomParent
                    }
                  >
                    Start stocktake
                  </button>
                  <button
                    type="button"
                    className={styles.outlineButton}
                    onClick={() => selectedWarehouseId && loadPeriods(selectedWarehouseId)}
                    disabled={!selectedWarehouseId}
                  >
                    Refresh periods
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Open period</h2>
                <span className={styles.panelNote}>Current active stocktake</span>
              </div>
              <div className={styles.panelBody}>
                {isColdroomParent ? (
                  <>
                    <div className={styles.summaryCard}>
                      <p className={styles.summaryTitle}>Coldroom children</p>
                      <p className={styles.summaryMeta}>
                        Open periods: {Object.values(childOpenPeriods).filter(Boolean).length}
                      </p>
                      <p className={styles.summaryMeta}>
                        Selected children: {selectedChildWarehouseIds.length}
                      </p>
                    </div>
                    <div className={styles.actionRow}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => {
                          setView("counts");
                          loadChildPeriods(selectedChildWarehouseIds);
                        }}
                        disabled={!hasStocktakeAccess || selectedChildWarehouseIds.length === 0}
                      >
                        Enter counts
                      </button>
                      <button
                        type="button"
                        className={styles.outlineButton}
                        onClick={() => loadChildPeriods(selectedChildWarehouseIds)}
                      >
                        Refresh child periods
                      </button>
                    </div>
                  </>
                ) : openPeriod ? (
                  <>
                    <div className={styles.summaryCard}>
                      <p className={styles.summaryTitle}>{openPeriod.stocktake_number || "In-progress"}</p>
                      <p className={styles.summaryMeta}>Status: {openPeriod.status}</p>
                      <p className={styles.summaryMeta}>Opened: {formatStamp(openPeriod.opened_at)}</p>
                      <p className={styles.summaryMeta}>Closed: {formatStamp(openPeriod.closed_at)}</p>
                      {formatUtcIso(openPeriod.opened_at) && (
                        <p className={styles.summaryMeta}>Sync cutoff (UTC): {formatUtcIso(openPeriod.opened_at)}</p>
                      )}
                      {openPeriod.note ? <p className={styles.summaryMeta}>Note: {openPeriod.note}</p> : null}
                    </div>
                    <div className={styles.actionRow}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => {
                          setActivePeriodId(openPeriod.id);
                          setView("counts");
                          loadPeriodCounts(openPeriod.id);
                        }}
                        disabled={!hasStocktakeAccess}
                      >
                        Enter counts
                      </button>
                      <button
                        type="button"
                        className={styles.outlineButton}
                        onClick={() => {
                          setActivePeriodId(openPeriod.id);
                          setView("variance");
                          loadVarianceFor(openPeriod.id);
                        }}
                      >
                        View variance
                      </button>
                    </div>
                  </>
                ) : (
                  <p className={styles.emptyState}>No open period for this warehouse yet.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {view === "periods" && (
          <section className={styles.panelStack}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Stocktake periods</h2>
                <span className={styles.panelNote}>Review open and closed stocktakes.</span>
              </div>
              <div className={styles.panelBody}>
                <label className={styles.fieldLabel}>
                  Warehouse
                  <select
                    className={styles.select}
                    value={selectedWarehouseId}
                    onChange={(event) => setSelectedWarehouseId(event.target.value)}
                    disabled={warehouses.length === 0}
                  >
                    {warehouses.length === 0 ? (
                      <option value="">No warehouses found</option>
                    ) : (
                      warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name || warehouse.code || warehouse.id}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                {isColdroomParent && (
                  <p className={styles.helperText}>
                    Coldroom parent uses child stocktakes. Select a child warehouse to review periods.
                  </p>
                )}
              </div>
            </div>

            {periodsLoading && <p className={styles.loadingTag}>Refreshing periods...</p>}
            {periodsError && <p className={styles.errorBanner}>{periodsError}</p>}

            <div className={styles.sectionBlock}>
              <h3 className={styles.sectionTitle}>Open periods</h3>
              {openPeriods.length === 0 ? (
                <p className={styles.emptyState}>No open periods found.</p>
              ) : (
                <div className={styles.cardGrid}>
                  {openPeriods.map((period) => (
                    <article key={period.id} className={styles.periodCard}>
                      <h4 className={styles.periodTitle}>{period.stocktake_number || period.id.slice(0, 8)}</h4>
                      <p className={styles.periodMeta}>Status: {period.status}</p>
                      <p className={styles.periodMeta}>Opened: {formatStamp(period.opened_at)}</p>
                      <p className={styles.periodMeta}>Closed: {formatStamp(period.closed_at)}</p>
                      {period.note ? <p className={styles.periodMeta}>Note: {period.note}</p> : null}
                      <div className={styles.periodActions}>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => {
                            setActivePeriodId(period.id);
                            setView("counts");
                            loadPeriodCounts(period.id);
                          }}
                          disabled={!hasStocktakeAccess}
                        >
                          Enter counts
                        </button>
                        <button
                          type="button"
                          className={styles.outlineButton}
                          onClick={() => {
                            setActivePeriodId(period.id);
                            setView("periodCounts");
                            loadPeriodCounts(period.id);
                          }}
                        >
                          View counts
                        </button>
                        <button
                          type="button"
                          className={styles.ghostButton}
                          onClick={() => downloadVariancePdf(period)}
                          disabled={pdfBusyId === period.id}
                        >
                          Variance PDF
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.sectionBlock}>
              <h3 className={styles.sectionTitle}>Closed periods</h3>
              {closedPeriods.length === 0 ? (
                <p className={styles.emptyState}>No closed periods found.</p>
              ) : (
                <div className={styles.cardGrid}>
                  {closedPeriods.map((period) => (
                    <article key={period.id} className={styles.periodCard}>
                      <h4 className={styles.periodTitle}>{period.stocktake_number || period.id.slice(0, 8)}</h4>
                      <p className={styles.periodMeta}>Status: {period.status}</p>
                      <p className={styles.periodMeta}>Opened: {formatStamp(period.opened_at)}</p>
                      <p className={styles.periodMeta}>Closed: {formatStamp(period.closed_at)}</p>
                      {period.note ? <p className={styles.periodMeta}>Note: {period.note}</p> : null}
                      <div className={styles.periodActions}>
                        <button
                          type="button"
                          className={styles.outlineButton}
                          onClick={() => {
                            setActivePeriodId(period.id);
                            setView("periodCounts");
                            loadPeriodCounts(period.id);
                          }}
                        >
                          View counts
                        </button>
                        <button
                          type="button"
                          className={styles.ghostButton}
                          onClick={() => downloadVariancePdf(period)}
                          disabled={pdfBusyId === period.id}
                        >
                          Variance PDF
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {view === "counts" && (
          <section className={styles.panelStack}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Stocktake counts</h2>
                <span className={styles.panelNote}>Tap an item to enter counts.</span>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.countsHeader}>
                  <div>
                    <p className={styles.summaryTitle}>{activePeriod?.stocktake_number || "Stocktake"}</p>
                    <p className={styles.summaryMeta}>Warehouse: {warehouseNameMap.get(selectedWarehouseId)?.name || "--"}</p>
                  </div>
                  <div className={styles.actionRow}>
                    <button type="button" className={styles.outlineButton} onClick={handleLeaveCounts}>
                      Back
                    </button>
                    <button
                      type="button"
                      className={styles.outlineButton}
                      onClick={() => {
                        if (selectedWarehouseId) refreshItemsForWarehouse(selectedWarehouseId);
                        if (isColdroomParent) {
                          loadChildPeriods(selectedChildWarehouseIds);
                        } else if (activePeriodId) {
                          loadPeriodCounts(activePeriodId);
                        }
                      }}
                    >
                      Refresh
                    </button>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      disabled={loading || !canClosePeriod || hasUnsaved || readOnly || !hasStocktakeAccess}
                      onClick={() =>
                        setConfirmState({
                          title: "Close stocktake period",
                          message: "Closing will lock this period so a new one can start. Continue?",
                          onConfirm: handleClosePeriod,
                        })
                      }
                    >
                      Close period
                    </button>
                  </div>
                </div>

                {isColdroomParent && (
                  <div className={styles.childSelector}>
                    <div className={styles.childHeader}>
                      <p className={styles.childTitle}>Child warehouses</p>
                      <div className={styles.childActions}>
                        <button type="button" className={styles.ghostButton} onClick={selectAllChildWarehouses}>
                          Select all
                        </button>
                        <button type="button" className={styles.ghostButton} onClick={clearChildWarehouses}>
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className={styles.childList}>
                      {COLDROOM_CHILDREN.map((child) => (
                        <label key={child.id} className={styles.childRow}>
                          <input
                            type="checkbox"
                            checked={selectedChildWarehouseIds.includes(child.id)}
                            onChange={() => toggleChildWarehouse(child.id)}
                          />
                          <span>{child.name}</span>
                        </label>
                      ))}
                    </div>
                    {!selectedChildWarehouseIds.length && (
                      <p className={styles.helperText}>Select at least one child warehouse to enter counts.</p>
                    )}
                  </div>
                )}

                <label className={styles.fieldLabel}>
                  Search items
                  <input
                    className={styles.input}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search items in warehouse"
                  />
                </label>
                <p className={styles.helperText}>Opening counts must be entered before closing counts.</p>
                {inputError && <p className={styles.errorBanner}>{inputError}</p>}
                {itemsLoading && <p className={styles.loadingTag}>Loading items...</p>}
                {!itemsLoading && filteredDisplayItems.length === 0 && (
                  <p className={styles.emptyState}>No items found for this warehouse.</p>
                )}
              </div>
            </div>

            {lastCount && (
              <p className={styles.lastSaved}>
                {lastCount.kind === "opening" ? "Opening" : "Closing"} saved: {formatQty(lastCount.counted_qty, 2)}
              </p>
            )}

            <div className={styles.itemGrid}>
              {filteredDisplayItems.map((row) => {
                const rows = allItemsByItemId.get(row.item_id) ?? [];
                const variantCount = rows.filter((item) => normalizeVariantKey(item.variant_key) !== "base").length;
                const kind = (row.item_kind ?? "").toLowerCase();
                const hasRecipe = row.has_recipe && kind !== "ingredient";
                const recipeKey = makeKey(row.item_id, "base");
                const ingredientCount = recipeIngredients[recipeKey]?.length ?? null;
                const variantKey = normalizeVariantKey(row.variant_key);
                const variantLabel = variantLabelMap.get(variantKey) ?? "Base";
                const titleLabel = variantKey === "base"
                  ? (row.item_name || "Item")
                  : `${row.item_name || "Item"} - ${variantLabel}`;
                const badge = kind === "ingredient"
                  ? "Ingredient"
                  : hasRecipe
                    ? `Ingredients: ${ingredientCount ?? "..."}`
                    : `Variants: ${variantCount}`;

                return (
                  <button
                    key={row.item_id}
                    type="button"
                    className={styles.itemCard}
                    onClick={() => {
                      setDialogItemId(row.item_id);
                      setDialogItemName(row.item_name ?? row.item_id);
                      setDialogItemKind(row.item_kind ?? null);
                      setDialogOpen(true);
                    }}
                  >
                    {row.image_url ? (
                      <img className={styles.itemImage} src={row.image_url} alt="Item" loading="lazy" />
                    ) : (
                      <div className={styles.itemPlaceholder}>{row.item_name?.slice(0, 1) ?? "#"}</div>
                    )}
                    <p className={styles.itemTitle}>{titleLabel}</p>
                    <p className={styles.itemBadge}>{badge}</p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {view === "periodCounts" && (
          <section className={styles.panelStack}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Period counts</h2>
                <span className={styles.panelNote}>Opening, closing, and variance summary.</span>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.actionRow}>
                  <button type="button" className={styles.outlineButton} onClick={() => setView("periods")}>
                    Back
                  </button>
                  {selectedPeriod?.status === "open" && (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() =>
                        setConfirmState({
                          title: "Import previous closing counts",
                          message:
                            "This will overwrite opening counts for this period using the previous period's closing counts.",
                          onConfirm: () =>
                            selectedPeriod &&
                            importPreviousClosingIntoOpening(selectedPeriod.id, selectedPeriod.warehouse_id, false, false),
                        })
                      }
                    >
                      Import previous closing
                    </button>
                  )}
                </div>
                {periodCountsLoading && <p className={styles.loadingTag}>Loading counts...</p>}
                {periodCountsError && <p className={styles.errorBanner}>{periodCountsError}</p>}
              </div>
            </div>

            {combinedPeriodRows.length > 0 ? (
              <div className={styles.cardGrid}>
                {combinedPeriodRows.map((row) => (
                  <article key={`${row.itemName}-${row.variantName}`} className={styles.periodCard}>
                    <h4 className={styles.periodTitle}>{row.itemName}</h4>
                    <p className={styles.periodMeta}>Variant: {row.variantName}</p>
                    <p className={styles.periodMeta}>Opening: {formatQty(row.openingQty, 2)}</p>
                    <p className={styles.periodMeta}>Closing: {formatQty(row.closingQty, 2)}</p>
                    <p className={styles.periodMeta}>Variance: {formatQty(row.varianceQty, 2)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyState}>No counts recorded for this period.</p>
            )}
          </section>
        )}

        {view === "variance" && (
          <section className={styles.panelStack}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Variance</h2>
                <span className={styles.panelNote}>Compare expected and counted stock.</span>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.actionRow}>
                  <button type="button" className={styles.outlineButton} onClick={() => setView("dashboard")}>
                    Back
                  </button>
                  {activePeriod && (
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={() => downloadVariancePdf(activePeriod)}
                      disabled={pdfBusyId === activePeriod.id}
                    >
                      Variance PDF
                    </button>
                  )}
                </div>
                {varianceLoading && <p className={styles.loadingTag}>Loading variance...</p>}
              </div>
            </div>

            {allowedVariance.length === 0 ? (
              <p className={styles.emptyState}>No variance rows for this period yet.</p>
            ) : (
              <div className={styles.cardGrid}>
                {allowedVariance.map((row) => {
                  const varianceValue = row.variance_qty ?? 0;
                  const varianceColor = varianceValue < 0 ? styles.negative : styles.positive;
                  return (
                    <article key={`${row.item_id}-${row.variant_key}`} className={styles.periodCard}>
                      <h4 className={styles.periodTitle}>{row.item_name || row.item_id}</h4>
                      <p className={styles.periodMeta}>Variant: {row.variant_key || "base"}</p>
                      <p className={styles.periodMeta}>Opening: {formatQty(row.opening_qty ?? 0, 2)}</p>
                      <p className={styles.periodMeta}>Movement: {formatQty(row.movement_qty ?? 0, 2)}</p>
                      <p className={styles.periodMeta}>
                        {varianceIncludeSales ? "Expected" : "Predicted"}: {formatQty(row.expected_qty ?? 0, 2)}
                      </p>
                      <p className={styles.periodMeta}>Counted: {formatQty(row.closing_qty ?? 0, 2)}</p>
                      <p className={`${styles.periodMeta} ${varianceColor}`}>
                        Variance: {formatQty(row.variance_qty ?? 0, 2)}
                      </p>
                      {(row.variance_cost ?? 0) !== 0 && (
                        <p className={`${styles.periodMeta} ${varianceColor}`}>
                          Variance value: {formatQty(row.variance_cost ?? 0, 2)}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {dialogOpen && (
        <div className={styles.dialogOverlay} role="dialog" aria-modal="true">
          <div className={styles.dialogPanel}>
            <div className={styles.dialogHeader}>
              <button
                type="button"
                className={styles.outlineButton}
                onClick={() => handleDialogClose(dialogDisplayRows)}
              >
                Back
              </button>
              <div>
                <p className={styles.dialogTitle}>{dialogItemName || dialogItemId}</p>
                <p className={styles.dialogSub}>
                  {dialogHasRecipe
                    ? "Enter ingredient counts"
                    : dialogHasIngredientVariants
                      ? "Enter ingredient variant counts"
                      : dialogIsIngredient
                        ? "Enter ingredient count"
                        : "Enter variant counts"}
                </p>
              </div>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => handleDialogClose(dialogDisplayRows)}
              >
                Close
              </button>
            </div>

            {dialogHasRecipe && dialogRecipeLoading && <p className={styles.loadingTag}>Loading ingredients...</p>}
            {dialogHasRecipe && !dialogRecipeLoading && dialogIngredientRows.length === 0 && (
              <p className={styles.emptyState}>No ingredients found for this recipe.</p>
            )}

            <div className={styles.dialogGrid}>
              {dialogDisplayRows.map((row) => {
                const variantKey = normalizeVariantKey(row.variant_key);
                const qtyKey = makeKey(row.item_id, variantKey);
                const uom =
                  variantStocktakeUomMap.get(variantKey) ||
                  stocktakeUoms[row.item_id] ||
                  variantUomMap.get(variantKey) ||
                  productUoms[row.item_id] ||
                  "each";
                const decimals = resolveDecimals(row.item_id, variantKey, uom);
                const step = stepForDecimals(decimals);
                const currentQty = dialogQty[qtyKey] ?? "";
                const openingLocked = openingLockedKeys.has(qtyKey);
                const entryMode = openingLocked ? "closing" : "opening";
                const isLocked = !activePeriodIsOpen;
                const hasOpeningCount = openingCountMap.has(qtyKey);
                const showTally = !isColdroomParent && openingLocked;
                const label = dialogHasRecipe
                  ? row.item_name || row.item_id
                  : variantKey === "base"
                    ? "Base"
                    : variantLabelMap.get(variantKey) || variantKey;
                const imageUrl =
                  dialogHasRecipe || variantKey === "base"
                    ? row.image_url
                    : variantImageMap.get(variantKey) || row.image_url;
                const fieldPlaceholder = isLocked ? "Locked" : "Qty";

                return (
                  <div key={qtyKey} className={styles.dialogCard}>
                    {showTally && <span className={styles.tallyBadge}>Tally mark</span>}
                    {imageUrl ? (
                      <img className={styles.dialogImage} src={imageUrl} alt="Item" />
                    ) : (
                      <div className={styles.itemPlaceholder}>{label.slice(0, 1)}</div>
                    )}
                    <p className={styles.dialogLabel}>{label}</p>
                    <p className={styles.dialogUom}>{formatUomLabel(uom)}</p>
                    {isColdroomParent ? (
                      <div className={styles.childQtyGrid}>
                        {selectedChildWarehouseIds.map((childId) => {
                          if (!selectedChildSet.has(childId)) return null;
                          const childKey = makeChildKey(childId, row.item_id, variantKey);
                          const childQty = dialogQty[childKey] ?? "";
                          const childPeriod = childOpenPeriods[childId];
                          const childOpeningLocked = childOpeningLockedKeys[childId]?.has(qtyKey) ?? false;
                          const childMode = childPeriod
                            ? childOpeningLocked
                              ? "Closing"
                              : "Opening"
                            : "Will open on save";
                          const childLocked = readOnly || !hasStocktakeAccess;
                          const childLabel = COLDROOM_CHILDREN.find((child) => child.id === childId)?.name || childId;

                          return (
                            <div key={childKey} className={styles.childQtyRow}>
                              <div className={styles.childMeta}>
                                <p className={styles.childLabel}>{childLabel}</p>
                                <p className={styles.childMode}>{childMode}</p>
                              </div>
                              <div className={styles.childQtyControl}>
                                <button
                                  type="button"
                                  className={styles.childQtyButton}
                                  onClick={() => {
                                    const parsed = Number(childQty) || 0;
                                    const next = Math.max(0, parsed - step);
                                    setDialogQty((prev) => ({
                                      ...prev,
                                      [childKey]: formatQty(next, decimals),
                                    }));
                                    setUnsavedKeys((prev) => ({ ...prev, [childKey]: true }));
                                  }}
                                  disabled={childLocked}
                                >
                                  -
                                </button>
                                <input
                                  className={styles.childQtyInput}
                                  value={childQty}
                                  onChange={(event) => {
                                    const value = sanitizeQtyInput(event.target.value, decimals);
                                    setDialogQty((prev) => ({ ...prev, [childKey]: value }));
                                    setUnsavedKeys((prev) => ({ ...prev, [childKey]: true }));
                                  }}
                                  placeholder={childLocked ? "Locked" : "Qty"}
                                  disabled={childLocked}
                                />
                                <button
                                  type="button"
                                  className={styles.childQtyButton}
                                  onClick={() => {
                                    const parsed = Number(childQty) || 0;
                                    const next = parsed + step;
                                    setDialogQty((prev) => ({
                                      ...prev,
                                      [childKey]: formatQty(next, decimals),
                                    }));
                                    setUnsavedKeys((prev) => ({ ...prev, [childKey]: true }));
                                  }}
                                  disabled={childLocked}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={styles.qtyControl}>
                        <button
                          type="button"
                          className={styles.qtyButton}
                          onClick={() => {
                            const parsed = Number(currentQty) || 0;
                            const next = Math.max(0, parsed - step);
                            setDialogQty((prev) => ({
                              ...prev,
                              [qtyKey]: formatQty(next, decimals),
                            }));
                            setUnsavedKeys((prev) => ({ ...prev, [qtyKey]: true }));
                          }}
                          disabled={isLocked}
                        >
                          -
                        </button>
                        <input
                          className={styles.qtyInput}
                          value={currentQty}
                          onChange={(event) => {
                            const value = sanitizeQtyInput(event.target.value, decimals);
                            setDialogQty((prev) => ({ ...prev, [qtyKey]: value }));
                            setUnsavedKeys((prev) => ({ ...prev, [qtyKey]: true }));
                          }}
                          placeholder={fieldPlaceholder}
                          disabled={isLocked}
                        />
                        <button
                          type="button"
                          className={styles.qtyButton}
                          onClick={() => {
                            const parsed = Number(currentQty) || 0;
                            const next = parsed + step;
                            setDialogQty((prev) => ({
                              ...prev,
                              [qtyKey]: formatQty(next, decimals),
                            }));
                            setUnsavedKeys((prev) => ({ ...prev, [qtyKey]: true }));
                          }}
                          disabled={isLocked}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.dialogActions}>
              <button type="button" className={styles.outlineButton} onClick={() => handleDialogClose(dialogDisplayRows)}>
                Back
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => {
                  if (isColdroomParent) {
                    const batch = buildBatchForRowsWithChildren(dialogDisplayRows);
                    if (!batch || batch.length === 0) {
                      setInputError("Enter a non-negative number.");
                      return;
                    }
                    recordCountsBatchForChildren(batch, dialogDisplayRows);
                    return;
                  }
                  const batch = buildBatchForRows(dialogDisplayRows);
                  if (!batch || batch.length === 0) {
                    setInputError("Enter a non-negative number.");
                    return;
                  }
                  recordCountsBatch(batch);
                }}
                disabled={
                  loading ||
                  (isColdroomParent ? (readOnly || !hasStocktakeAccess) : !activePeriodIsOpen) ||
                  (isColdroomParent
                    ? !dialogDisplayRows.some((row) =>
                        selectedChildWarehouseIds.some((childId) =>
                          unsavedKeys[makeChildKey(childId, row.item_id, normalizeVariantKey(row.variant_key))]
                        )
                      )
                    : !dialogDisplayRows.some((row) => unsavedKeys[makeKey(row.item_id, row.variant_key)]))
                }
              >
                Save item
              </button>
            </div>
            <p className={styles.helperText}>Use Save item to lock counts before leaving.</p>
          </div>
        </div>
      )}

      {confirmState && (
        <div className={styles.dialogOverlay} role="alertdialog" aria-modal="true">
          <div className={styles.confirmPanel}>
            <h3 className={styles.dialogTitle}>{confirmState.title}</h3>
            <p className={styles.dialogSub}>{confirmState.message}</p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.primaryButton} onClick={handleConfirmClose}>
                Confirm
              </button>
              <button type="button" className={styles.outlineButton} onClick={() => setConfirmState(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

button {
  background: none;
  border: none;
}

button:hover {
  transform: translateY(-1px);
}
`;
