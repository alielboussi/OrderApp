'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import type { Warehouse } from '@/types/warehouse';
const jsonFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
const transfersFetcher = async ([url, sourceId, destId, startDate, endDate]: [string, string, string, string, string]) => {
  const params = new URLSearchParams();
  if (sourceId) params.set('sourceId', sourceId);
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
function formatTimestamp(value?: string | null) {
  if (!value) return '-';
  try {
function titleCase(value?: string | null) {
  if (!value) return 'Unknown';
  const lower = value.toLowerCase();
export default function AdministratorBackofficePage() {
  const router = useRouter();
  const [sourceFilter, setSourceFilter] = useState('');
  const [manualRefresh, setManualRefresh] = useState(false);
  const lockedPathRef = useRef<string | null>(null);
  const allowNavigationRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const lockedPath = window.location.pathname + window.location.search;
  window.addEventListener('popstate', enforcePath);
  window.addEventListener('hashchange', enforcePath);
  const intervalId = window.setInterval(enforcePath, 1500);
  const { data: warehousesPayload, error: warehousesError, isLoading: warehousesLoading } = useSWR(
    '/api/warehouses',
    jsonFetcher,
  const { data: transfersPayload, error: transfersError, isLoading: transfersLoading, mutate: revalidateTransfers } = useSWR(
    ['/api/warehouse-transfers', sourceFilter, destFilter, startDate, endDate],
    transfersFetcher,
  const warehouseOptions = useMemo(() => {
    const registry = new Map<string, Warehouse>();
    warehouses.forEach((warehouse) => {
  const filteredTransfers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const startDateValue = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const showProgress = warehousesLoading || transfersLoading || manualRefresh;

  const handleManualRefresh = async () => {
  const clearRouteFilters = () => {
    setSourceFilter('');
    setDestFilter('');
  const resetAllFilters = () => {
    clearRouteFilters();
    setSearchQuery('');
  const temporarilyAllowNavigation = () => {
    if (typeof window === 'undefined') return;
    allowNavigationRef.current = true;
  const backToPrevious = () => {
    if (typeof window === 'undefined') return;
    temporarilyAllowNavigation();
  const logout = () => {
    if (typeof window === 'undefined') return;
    temporarilyAllowNavigation();
  return (
    <main className="min-h-screen bg-[#050A1B] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-8 lg:max-w-4xl">
        <header className="flex items-center gap-3 rounded-3xl border border-white/10 bg-[#131C35] px-6 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.65)]">
          <button
            onClick={backToPrevious}
          <div className="flex-1" />
          <button
            onClick={handleManualRefresh}
          <button
            onClick={logout}
            className="text-sm font-semibold text-white/80 transition hover:text-white"
        <section className="space-y-1">
          <h1 className="text-3xl font-semibold text-white">Warehouse Transfers</h1>
          <p className="text-sm text-white/70">Times shown in Zambia Standard Time • CAT (UTC+02)</p>
          {showProgress && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-[#FF1B2D]" />
          <section className="rounded-3xl border border-white/10 bg-[#131C35] p-6 shadow-[0_25px_70px_rgba(0,0,0,0.7)]">
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-6">
                <label className="space-y-2 text-sm font-semibold uppercase tracking-wide text-white/70">
                  From warehouse
                  <select
                    <option value="">Any warehouse</option>
                    {warehouseOptions.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                    <option value="">Any warehouse</option>
                    {warehouseOptions.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold uppercase tracking-wide text-white/70">
                  From date
                  <input
                    type="date"
                    value={startDate}
                <label className="space-y-2 text-sm font-semibold uppercase tracking-wide text-white/70">
                  To date
                  <input
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-white/70">Search everything</p>
                <div className="flex items-center gap-3 rounded-2xl border border-[#FF1B2D] bg-black/20 px-4 py-3">
                  <input
                    type="text"
                    value={searchQuery}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={clearRouteFilters}
                <button
                  onClick={resetAllFilters}
                  className="rounded-full border border-[#FF1B2D] bg-[#FF1B2D]/15 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-[#FF1B2D]/25"
            {warehousesError && (
              <p className="text-sm text-[#FF8B99]">Unable to load warehouses: {warehousesError.message}</p>
            )}
            {transfersError && (
              <p className="text-sm text-[#FF8B99]">{transfersError.message}</p>
            )}
            <div className="min-h-[480px] rounded-3xl border border-white/5 bg-[#0C152B] p-4">
              {transfersLoading && !transfers.length ? (
                <div className="flex h-full items-center justify-center text-white/70">Loading transfers…</div>
              ) : !filteredTransfers.length ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-white/70">No transfers match the current filters.</div>
              ) : (
                <div className="flex flex-col gap-4 overflow-y-auto pr-2" style={{ maxHeight: '520px' }}>
                  {filteredTransfers.map((transfer) => {
                    const sourceName = transfer.source?.name ?? warehouseMap.get(transfer.source_location_id ?? '')?.name ?? 'Unknown source';
                    const destName = transfer.dest?.name ?? warehouseMap.get(transfer.dest_location_id ?? '')?.name ?? 'Unknown destination';
                    const expanded = expandedTransferId === transfer.id;
                    const statusValue = transfer.status?.toLowerCase() ?? '';
                    const isCompleted = statusValue === 'completed';
                    const statusClasses = isCompleted
                      ? 'border-[#FF1B2D] bg-[#FF1B2D]/20 text-white'
                    return (
                      <article key={transfer.id} className="rounded-3xl border border-[#FF1B2D]/60 bg-[#131C35] p-5 shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex-1">
                            <p className="text-lg font-semibold text-white">
                              {sourceName} <span className="text-white/40">→</span> {destName}
                            <p className="text-sm text-white/60">{formatTimestamp(transfer.created_at)}</p>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusClasses}`}>
                            {titleCase(transfer.status)}
                          </span>
                          <button
                            <svg
                              viewBox="0 0 24 24"
                              className={`h-5 w-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                            </svg>
                          </button>
                        </div>
                        {transfer.note && (
                          <p className="mt-3 text-sm text-white/75">Note: {transfer.note}</p>
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

            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Syncs automatically every 5 minutes • Use refresh to pull now</p>
          </div>
        </section>
      </div>
    </main>
  );
}
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
  return (
    <main className="min-h-screen bg-[#050A1B] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-8 lg:max-w-4xl">
        <header className="flex items-center gap-3 rounded-3xl border border-white/10 bg-[#131C35] px-6 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.65)]">
          <button
            onClick={backToPrevious}
            className="rounded-full bg-[#FF1B2D] px-6 py-2 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(255,27,45,0.35)] transition hover:-translate-y-0.5"
          >
            Back
          </button>
          <div className="flex-1" />
          <button
            onClick={handleManualRefresh}
            title="Refresh transfers"
            className="rounded-full border border-white/30 p-2 text-white transition hover:border-white hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className={manualRefresh ? 'h-5 w-5 animate-spin' : 'h-5 w-5'} aria-hidden>
              <path
                fill="currentColor"
                d="M17.65 6.35A7.95 7.95 0 0012 4V1L7 6l5 5V7c2.76 0 5 2.24 5 5a5 5 0 01-5 5 5 5 0 01-4.9-4H5.08A7 7 0 0012 21a7 7 0 007-7 6.99 6.99 0 00-1.35-4.65z"
              />
            </svg>
          </button>
          <button
            onClick={logout}
            className="text-sm font-semibold text-white/80 transition hover:text-white"
          >
            Log out
          </button>
        </header>

        <section className="space-y-1">
          <h1 className="text-3xl font-semibold text-white">Warehouse Transfers</h1>
          <p className="text-sm text-white/70">Times shown in Zambia Standard Time • CAT (UTC+02)</p>
          <p className="text-sm text-white/60">Syncs automatically every 5 minutes • Tap refresh for now</p>
        </section>

        {showProgress && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[#FF1B2D]" />
          </div>
        )}

        <section className="rounded-3xl border border-white/10 bg-[#131C35] p-6 shadow-[0_25px_70px_rgba(0,0,0,0.7)]">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-6">
              <div className="space-y-6">
                <label className="space-y-2 text-sm font-semibold uppercase tracking-wide text-white/70">
                  From warehouse
                  <select
                    value={sourceFilter}
                    onChange={(event) => setSourceFilter(event.target.value)}
                    className="w-full rounded-2xl border border-[#FF1B2D] bg-transparent px-4 py-3 text-base text-white focus:border-[#FF5C6A] focus:outline-none"
                  >
                    <option value="">Any warehouse</option>
                    {warehouseOptions.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-semibold uppercase tracking-wide text-white/70">
                  To warehouse
                  <select
                    value={destFilter}
                    onChange={(event) => setDestFilter(event.target.value)}
                    className="w-full rounded-2xl border border-[#FF1B2D] bg-transparent px-4 py-3 text-base text-white focus:border-[#FF5C6A] focus:outline-none"
                  >
                    <option value="">Any warehouse</option>
                    {warehouseOptions.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold uppercase tracking-wide text-white/70">
                  From date
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="w-full rounded-2xl border border-[#FF1B2D] bg-transparent px-4 py-3 text-base text-white focus:border-[#FF5C6A] focus:outline-none"
                  />
                </label>
                <label className="space-y-2 text-sm font-semibold uppercase tracking-wide text-white/70">
                  To date
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="w-full rounded-2xl border border-[#FF1B2D] bg-transparent px-4 py-3 text-base text-white focus:border-[#FF5C6A] focus:outline-none"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-white/70">Search everything</p>
                <div className="flex items-center gap-3 rounded-2xl border border-[#FF1B2D] bg-black/20 px-4 py-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#FF1B2D]" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M15.5 14h-.79l-.28-.27a6 6 0 10-.71.71l.27.28v.79L20 21.49 21.49 20 15.5 14zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z"
                    />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Warehouse, product, SKU, note"
                    className="w-full bg-transparent text-base text-white placeholder:text-white/40 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={clearRouteFilters}
                  disabled={!sourceFilter && !destFilter}
                  className="rounded-full border border-white/30 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white disabled:border-white/10 disabled:text-white/30"
                >
                  Clear route
                </button>
                <button
                  onClick={resetAllFilters}
                  className="rounded-full border border-[#FF1B2D] bg-[#FF1B2D]/15 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-[#FF1B2D]/25"
                >
                  Reset all filters
                </button>
              </div>
            </div>

            {warehousesError && (
              <p className="text-sm text-[#FF8B99]">Unable to load warehouses: {warehousesError.message}</p>
            )}
            {transfersError && (
              <p className="text-sm text-[#FF8B99]">{transfersError.message}</p>
            )}

            <div className="min-h-[480px] rounded-3xl border border-white/5 bg-[#0C152B] p-4">
              {transfersLoading && !transfers.length ? (
                <div className="flex h-full items-center justify-center text-white/70">Loading transfers…</div>
              ) : !filteredTransfers.length ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-white/70">No transfers match the current filters.</div>
              ) : (
                <div className="flex flex-col gap-4 overflow-y-auto pr-2" style={{ maxHeight: '520px' }}>
                  {filteredTransfers.map((transfer) => {
                    const sourceName = transfer.source?.name ?? warehouseMap.get(transfer.source_location_id ?? '')?.name ?? 'Unknown source';
                    const destName = transfer.dest?.name ?? warehouseMap.get(transfer.dest_location_id ?? '')?.name ?? 'Unknown destination';
                    const expanded = expandedTransferId === transfer.id;
                    const statusValue = transfer.status?.toLowerCase() ?? '';
                    const isCompleted = statusValue === 'completed';
                    const statusClasses = isCompleted
                      ? 'border-[#FF1B2D] bg-[#FF1B2D]/20 text-white'
                      : 'border-white/25 text-white/80';
                    return (
                      <article key={transfer.id} className="rounded-3xl border border-[#FF1B2D]/60 bg-[#131C35] p-5 shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex-1">
                            <p className="text-lg font-semibold text-white">
                              {sourceName} <span className="text-white/40">→</span> {destName}
                            </p>
                            <p className="text-sm text-white/60">{formatTimestamp(transfer.created_at)}</p>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusClasses}`}>
                            {titleCase(transfer.status)}
                          </span>
                          <button
                            onClick={() => setExpandedTransferId(expanded ? null : transfer.id)}
                            aria-label={expanded ? 'Collapse details' : 'Expand details'}
                            className="rounded-full border border-white/25 p-2 text-white transition hover:border-white"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className={`h-5 w-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                              aria-hidden
                            >
                              <path fill="currentColor" d="M7 10l5 5 5-5z" />
                            </svg>
                          </button>
                        </div>
                        {transfer.note && (
                          <p className="mt-3 text-sm text-white/75">Note: {transfer.note}</p>
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

            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Syncs automatically every 5 minutes • Use refresh to pull now</p>
          </div>
        </section>
      </div>
    </main>
  );
    setEndDate('');
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
          <p className="max-w-3xl text-base text-white/70">Times reflect Zambia Standard Time. This dashboard syncs automatically every five minutes, and you can tap refresh anytime you need the latest transfers right away.</p>
        </section>

        {showProgress && <div className="h-1 w-full rounded-full bg-red-900/40"><div className="h-full w-1/3 animate-pulse rounded-full bg-red-500" /></div>}

        <section className="rounded-3xl bg-[#111] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold uppercase tracking-wide text-white/70">From warehouse</p>
                  <select
                    value={sourceFilter}
                    onChange={(event) => setSourceFilter(event.target.value)}
                    className="w-full rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-base text-white focus:border-red-500 focus:outline-none"
                  >
                    <option value="">Any warehouse</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold uppercase tracking-wide text-white/70">To warehouse</p>
                  <select
                    value={destFilter}
                    onChange={(event) => setDestFilter(event.target.value)}
                    className="w-full rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-base text-white focus:border-red-500 focus:outline-none"
                  >
                    <option value="">Any warehouse</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold uppercase tracking-wide text-white/70">
                  From date
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="w-full rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-base text-white focus:border-red-500 focus:outline-none"
                  />
                </label>
                <label className="space-y-2 text-sm font-semibold uppercase tracking-wide text-white/70">
                  To date
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="w-full rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-base text-white focus:border-red-500 focus:outline-none"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-white/70">Search everything</p>
                <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black/40 px-4 py-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-500" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M15.5 14h-.79l-.28-.27a6 6 0 10-.71.71l.27.28v.79L20 21.49 21.49 20 15.5 14zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z"
                    />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Warehouse, product, SKU, note"
                    className="w-full bg-transparent text-base text-white placeholder:text-white/40 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={clearRouteFilters}
                  disabled={!sourceFilter && !destFilter}
                  className="rounded-full border border-white/20 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white/60 disabled:border-white/10 disabled:text-white/30"
                >
                  Clear route
                </button>
                <button
                  onClick={resetAllFilters}
                  className="rounded-full border border-red-500/40 bg-red-500/10 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-red-500/20"
                >
                  Reset all filters
                </button>
              </div>
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
              ) : !filteredTransfers.length ? (
                <div className="flex h-full items-center justify-center text-center text-white/60">No transfers match the current filters.</div>
              ) : (
                <div className="flex flex-col gap-4 overflow-y-auto pr-2" style={{ maxHeight: '520px' }}>
                  {filteredTransfers.map((transfer) => {
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

            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Syncs automatically every 5 minutes • Use refresh to pull now</p>
          </div>
        </section>
      </div>
    </main>
  );
}
