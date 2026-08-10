export type SupervisorUomConversion = {
  orders_uom_conversion_qty: number;
  supervisor_uom_conversion_qty: number;
  supervisor_uom_qty_per_unit: number;
};

function readPositiveInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

/** Parse conversion from a catalog row. Legacy rows only store supervisor_uom_qty_per_unit. */
export function readSupervisorUomConversionFromRow(
  row?: Record<string, unknown> | null,
): SupervisorUomConversion {
  if (!row) {
    return {
      orders_uom_conversion_qty: 1,
      supervisor_uom_conversion_qty: 1,
      supervisor_uom_qty_per_unit: 1,
    };
  }

  const ordersQty = readPositiveInt(
    row.orders_uom_conversion_qty ?? row.ordersUomConversionQty,
    0,
  );
  const supervisorQty = readPositiveInt(
    row.supervisor_uom_conversion_qty ?? row.supervisorUomConversionQty,
    0,
  );

  if (ordersQty > 0 && supervisorQty > 0) {
    const perUnit = Math.max(1, Math.round(ordersQty / supervisorQty));
    return {
      orders_uom_conversion_qty: ordersQty,
      supervisor_uom_conversion_qty: supervisorQty,
      supervisor_uom_qty_per_unit: perUnit,
    };
  }

  const perUnit = readPositiveInt(
    row.supervisor_uom_qty_per_unit ?? row.supervisorUomQtyPerUnit,
    1,
  ) || 1;

  return {
    orders_uom_conversion_qty: perUnit,
    supervisor_uom_conversion_qty: 1,
    supervisor_uom_qty_per_unit: perUnit,
  };
}

export function resolveSupervisorUomQtyPerUnitFromRow(
  row?: Record<string, unknown> | null,
): number {
  return readSupervisorUomConversionFromRow(row).supervisor_uom_qty_per_unit;
}

export function parseSupervisorUomConversionInput(
  ordersQtyInput: unknown,
  supervisorQtyInput: unknown,
): SupervisorUomConversion | { error: string } {
  const ordersQty = readPositiveInt(ordersQtyInput, 0);
  const supervisorQty = readPositiveInt(supervisorQtyInput, 0);
  if (ordersQty <= 0) {
    return { error: "Orders UOM quantity must be at least 1." };
  }
  if (supervisorQty <= 0) {
    return { error: "Supervisor UOM quantity must be at least 1." };
  }
  const perUnit = Math.max(1, Math.round(ordersQty / supervisorQty));
  return {
    orders_uom_conversion_qty: ordersQty,
    supervisor_uom_conversion_qty: supervisorQty,
    supervisor_uom_qty_per_unit: perUnit,
  };
}

export function buildSupervisorUomConversionFirestoreFields(
  conversion: SupervisorUomConversion,
): Record<string, number> {
  return {
    orders_uom_conversion_qty: conversion.orders_uom_conversion_qty,
    supervisor_uom_conversion_qty: conversion.supervisor_uom_conversion_qty,
    supervisor_uom_qty_per_unit: conversion.supervisor_uom_qty_per_unit,
  };
}

export function formatSupervisorUomConversionSummary(
  conversion: SupervisorUomConversion,
  ordersUomLabel: string,
  supervisorUomLabel: string,
): string {
  const ordersLabel = ordersUomLabel.trim() || "orders unit";
  const supervisorLabel = supervisorUomLabel.trim() || "supervisor unit";
  if (
    conversion.orders_uom_conversion_qty === 1 &&
    conversion.supervisor_uom_conversion_qty === 1
  ) {
    return `1 ${ordersLabel} = 1 ${supervisorLabel}`;
  }
  return `${conversion.orders_uom_conversion_qty} ${ordersLabel} = ${conversion.supervisor_uom_conversion_qty} ${supervisorLabel}`;
}
