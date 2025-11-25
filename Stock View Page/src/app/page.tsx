'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import useSWR from 'swr';
import type { AggregatedStockRow, Warehouse } from '@/types/warehouse';

const warehouseFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to load warehouses');
  }
  return (await res.json()) as { warehouses: Warehouse[] };
};

const stockFetcher = async ([, warehouseId, search]: [string, string, string]) => {
  const res = await fetch('/api/stock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ warehouseId, search }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error ?? 'Failed to load stock');
  }
  return (await res.json()) as {
    rows: Array<{ product_id: string }>;
    aggregates: AggregatedStockRow[];
    warehouseCount: number;
  };
};

type WarehouseOption = Warehouse & { pathLabel: string };

function buildWarehouseOptions(warehouses?: Warehouse[]): WarehouseOption[] {
  if (!warehouses) return [];
  const lookup = new Map<string, Warehouse>();
  warehouses.forEach((wh) => lookup.set(wh.id, wh));

  const buildPath = (warehouse: Warehouse): string => {
    const parts: string[] = [warehouse.name];
    let parentId = warehouse.parent_warehouse_id;
    while (parentId) {
      const parent = lookup.get(parentId);
      if (!parent) break;
      parts.push(parent.name);
      parentId = parent.parent_warehouse_id;
    }
    return parts.reverse().join(' › ');
  };

  return warehouses
    .map((wh) => ({ ...wh, pathLabel: buildPath(wh) }))
    .sort((a, b) => a.pathLabel.localeCompare(b.pathLabel));
}

export default function StockDashboardPage() {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);

  const {
    data: warehouseData,
    error: warehouseError,
    isLoading: warehousesLoading,
  } = useSWR('/api/warehouses', warehouseFetcher, { revalidateOnFocus: false });
  const warehouseOptions = useMemo(
    () => buildWarehouseOptions(warehouseData?.warehouses),
    [warehouseData]
  );

  const {
    data: stockData,
    error: stockError,
    isLoading: stockLoading,
  } = useSWR(
    selectedWarehouseId ? ['stock', selectedWarehouseId, deferredSearch] : null,
    stockFetcher,
    { revalidateOnFocus: false }
  );

  const selectedWarehouse = warehouseOptions.find((wh) => wh.id === selectedWarehouseId);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="space-y-1">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Stock View Page
          </p>
          <h1 className="text-3xl font-semibold text-slate-900">Warehouse Stock Snapshot</h1>
          <p className="text-sm text-slate-600">
            Pick a warehouse to see the remaining units across the location and any child cold rooms. This standalone
            page is safe to bookmark on iOS/Android and ignores navigation outside this view.
          </p>
        </header>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row">
            <label className="flex flex-1 flex-col text-sm font-medium text-slate-700">
              Warehouse
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 focus:border-slate-400 focus:outline-none"
                value={selectedWarehouseId}
                onChange={(event) => setSelectedWarehouseId(event.target.value)}
              >
                <option value="">Select a warehouse…</option>
                {warehouseOptions.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.pathLabel}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-1 flex-col text-sm font-medium text-slate-700">
              Search
              <input
                className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-base text-slate-900 focus:border-slate-400 focus:outline-none"
                placeholder="Product name, product ID, or variation ID"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                disabled={!selectedWarehouseId}
              />
            </label>
          </div>
          {warehouseError && (
            <p className="mt-3 text-sm text-rose-600">Unable to load warehouses: {warehouseError.message}</p>
          )}
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm">
          {!selectedWarehouseId && (
            <p className="text-sm text-slate-500">Select a warehouse to view current stock.</p>
          )}

          {selectedWarehouseId && (stockLoading || warehousesLoading) && (
            <p className="text-sm text-slate-500">Loading stock data…</p>
          )}

          {selectedWarehouseId && stockError && (
            <p className="text-sm text-rose-600">{stockError.message}</p>
          )}

          {selectedWarehouseId && stockData && !stockData.aggregates.length && (
            <p className="text-sm text-slate-500">No products match your filters.</p>
          )}

          {selectedWarehouseId && stockData && stockData.aggregates.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-slate-50">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-200">Viewing</p>
                  <p className="text-base font-semibold">
                    {selectedWarehouse?.pathLabel ?? 'Warehouse'} · {stockData.warehouseCount} location(s)
                  </p>
                </div>
                <p className="text-2xl font-semibold">
                  {stockData.aggregates.reduce((sum, row) => sum + row.totalQty, 0).toLocaleString('en-US')}
                  <span className="ml-2 text-sm font-normal text-slate-200">units</span>
                </p>
              </div>

              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
                {stockData.aggregates.map((row) => (
                  <li key={`${row.productId}-${row.variationId ?? 'novar'}`} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">{row.productName}</p>
                        <p className="text-sm text-slate-500">
                          {row.variationName ? row.variationName : 'Base SKU'} · {row.productId}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-semibold text-slate-900">
                          {row.totalQty.toLocaleString('en-US')}
                        </p>
                        <p className="text-xs uppercase tracking-wide text-slate-400">units</p>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      {row.warehouses.map((warehouse, index) => (
                        <span key={warehouse.warehouseId}>
                          {warehouse.warehouseName} ({warehouse.qty.toLocaleString('en-US')})
                          {index === row.warehouses.length - 1 ? '' : ' · '}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
