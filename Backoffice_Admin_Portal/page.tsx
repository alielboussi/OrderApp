'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import type { Warehouse } from '@/types/warehouse';
import type { WarehouseTransfer } from '@/types/transfers';

const jsonFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error ?? 'Request failed');
  }
  return res.json();
};

const transfersFetcher = async ([url, sourceId, destId]: [string, string, string]) => {
  const params = new URLSearchParams();
  if (sourceId) params.set('sourceId', sourceId);
  if (destId) params.set('destId', destId);
  const query = params.toString();
  const res = await fetch(query ? `${url}?${query}` : url);
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error ?? 'Unable to load transfers');
  }
  return res.json();
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
});

const qtyFormatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function formatTimestamp(value?: string | null) {
  if (!value) return '-';
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

function titleCase(value?: string | null) {
  if (!value) return 'Unknown';
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export default function AdministratorBackofficePage() {
  const router = useRouter();
  const [sourceFilter, setSourceFilter] = useState('');
  const [destFilter, setDestFilter] = useState('');
  const [expandedTransferId, setExpandedTransferId] = useState<string | null>(null);
  const [manualRefresh, setManualRefresh] = useState(false);

  const {
    data: warehousesPayload,
    error: warehousesError,
    isLoading: warehousesLoading,
  } = useSWR('/api/warehouses', jsonFetcher, { revalidateOnFocus: false, refreshInterval: 300000 });

  const warehouses: Warehouse[] = warehousesPayload?.warehouses ?? [];
  const warehouseMap = useMemo(() => new Map(warehouses.map((wh) => [wh.id, wh])), [warehouses]);

  const {
    data: transfersPayload,
    error: transfersError,
    isLoading: transfersLoading,
    mutate: revalidateTransfers,
  } = useSWR([
    '/api/warehouse-transfers',
    sourceFilter,
    destFilter,
  ], transfersFetcher, {
    revalidateOnFocus: false,
    refreshInterval: 6000,
  });

  const transfers: WarehouseTransfer[] = transfersPayload?.transfers ?? [];
  const showProgress = warehousesLoading || transfersLoading || manualRefresh;

  const handleManualRefresh = async () => {
    setManualRefresh(true);
    try {
      await revalidateTransfers();
    } finally {
      setManualRefresh(false);
    }
  };

  const clearFilters = () => {
    setSourceFilter('');
    setDestFilter('');
  };

  const backToPrevious = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  const logout = () => {
    window.location.href = '/';
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col gap-6 px-10 py-8">
        <header className="flex items-center gap-3 rounded-3xl bg-[#111] px-6 py-4 shadow-lg shadow-black/60">
          <button
            onClick={backToPrevious}
            className="rounded-full border border-white/20 px-6 py-2 text-sm font-semibold tracking-wide text-white transition hover:border-white hover:bg-white/10"
          >
            Back
          </button>
          <div className="flex-1" />
          <button
            onClick={handleManualRefresh}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white hover:bg-white/10"
          >
            Refresh
          </button>
          <button
            onClick={logout}
            className="rounded-full bg-red-600 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-red-500"
          >
            Log out
          </button>
        </header>

        <section>
          <p className="text-sm uppercase tracking-[0.3em] text-red-400">Administrator Backoffice</p>
          <h1 className="text-4xl font-semibold text-white">Warehouse Transfers</h1>
          <p className="max-w-3xl text-base text-white/70">Live feed from the scanner portals, optimized for a 1920×1080 workstation. Filters below match the Android warehouse workspace so desktop supervisors can triage transfers in real time.</p>
        </section>

        {showProgress && <div className="h-1 w-full rounded-full bg-red-900/40"><div className="h-full w-1/3 animate-pulse rounded-full bg-red-500" /></div>}

        <section className="rounded-3xl bg-[#111] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="text-sm font-semibold text-white/80">
                From warehouse
                <select
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white focus:border-red-500 focus:outline-none"
                >
                  <option value="">Any warehouse</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-white/80">
                To warehouse
                <select
                  value={destFilter}
                  onChange={(event) => setDestFilter(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white focus:border-red-500 focus:outline-none"
                >
                  <option value="">Any warehouse</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/30 px-4 py-3 text-sm text-white/70">
              <span className="font-semibold text-white">Filter transfers by source and destination</span>
              {(sourceFilter || destFilter) && (
                <button onClick={clearFilters} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white hover:bg-white/20">
                  Clear filters
                </button>
              )}
            </div>

            {warehousesError && (
              <p className="text-sm text-red-400">Unable to load warehouses: {warehousesError.message}</p>
            )}
            {transfersError && (
              <p className="text-sm text-red-400">{transfersError.message}</p>
            )}

            <div className="min-h-[480px] rounded-3xl border border-white/5 bg-black/40 p-4">
              {transfersLoading && !transfers.length ? (
                <div className="flex h-full items-center justify-center text-white/60">Loading transfers…</div>
              ) : !transfers.length ? (
                <div className="flex h-full items-center justify-center text-white/60">No transfers have been logged yet.</div>
              ) : (
                <div className="flex flex-col gap-4 overflow-y-auto pr-2" style={{ maxHeight: '520px' }}>
                  {transfers.map((transfer) => {
                    const sourceName = warehouseMap.get(transfer.source_location_id ?? '')?.name ?? 'Unknown source';
                    const destName = warehouseMap.get(transfer.dest_location_id ?? '')?.name ?? 'Unknown destination';
                    const expanded = expandedTransferId === transfer.id;
                    return (
                      <article key={transfer.id} className="rounded-2xl border border-white/15 bg-[#090909] p-5 shadow-lg shadow-black/60">
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex-1">
                            <p className="text-lg font-semibold text-white">
                              {sourceName} <span className="text-white/40">→</span> {destName}
                            </p>
                            <p className="text-sm text-white/60">{formatTimestamp(transfer.created_at)}</p>
                          </div>
                          <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
                            {titleCase(transfer.status)}
                          </span>
                          <button
                            onClick={() => setExpandedTransferId(expanded ? null : transfer.id)}
                            className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:border-white/40"
                          >
                            {expanded ? 'Collapse' : 'Expand'}
                          </button>
                        </div>
                        {transfer.note && (
                          <p className="mt-3 text-sm text-white/70">Note: {transfer.note}</p>
                        )}
                        {transfer.completed_at && (
                          <p className="mt-1 text-xs text-white/50">Completed {formatTimestamp(transfer.completed_at)}</p>
                        )}
                        {expanded && (
                          <div className="mt-4 space-y-3 rounded-2xl bg-black/30 p-4">
                            {transfer.items.map((item) => (
                              <div key={item.id} className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="font-semibold text-white">
                                    {item.product?.name ?? 'Unknown product'}
                                    {item.variation?.name ? <span className="text-white/50"> · {item.variation.name}</span> : null}
                                  </p>
                                  <p className="text-xs text-white/50">{item.product_id ?? item.variation_id ?? 'Item'}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-lg font-semibold text-white">{qtyFormatter.format(item.qty)}</p>
                                  <p className="text-xs uppercase text-white/50">{item.variation?.uom ?? item.product?.uom ?? 'units'}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Updating every 6 seconds</p>
          </div>
        </section>
      </div>
    </main>
  );
}
