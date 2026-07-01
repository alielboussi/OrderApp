"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import styles from "./outletCatalogPush.module.css";

type CatalogEntityMultiSelectProps<T extends { id: string }> = {
  label: string;
  hint?: string;
  placeholder: string;
  items: T[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  renderMeta?: (item: T) => ReactNode;
  getItemLabel: (item: T) => string;
  toolbarExtra?: ReactNode;
};

export default function CatalogEntityMultiSelect<T extends { id: string }>({
  label,
  hint,
  placeholder,
  items,
  selectedIds,
  onChange,
  disabled,
  searchable,
  searchPlaceholder = "Search…",
  emptyMessage = "No options available.",
  renderMeta,
  getItemLabel,
  toolbarExtra,
}: CatalogEntityMultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => getItemLabel(item).toLowerCase().includes(normalized));
  }, [getItemLabel, items, query]);

  const selectedLabels = useMemo(
    () =>
      items
        .filter((item) => selectedIds.includes(item.id))
        .map((item) => getItemLabel(item)),
    [getItemLabel, items, selectedIds]
  );

  const triggerText =
    selectedIds.length === 0
      ? placeholder
      : selectedIds.length === 1
        ? selectedLabels[0] ?? "1 selected"
        : `${selectedIds.length} selected`;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const toggleItem = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  };

  const selectAllVisible = () => {
    const visibleIds = filteredItems.map((item) => item.id);
    onChange(Array.from(new Set([...selectedIds, ...visibleIds])));
  };

  const clearVisible = () => {
    const visible = new Set(filteredItems.map((item) => item.id));
    onChange(selectedIds.filter((id) => !visible.has(id)));
  };

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {hint ? <p className={styles.fieldHint}>{hint}</p> : null}
      <div className={styles.dropdown} ref={rootRef}>
        <button
          type="button"
          className={`${styles.dropdownTrigger} ${open ? styles.dropdownTriggerOpen : ""}`}
          onClick={() => !disabled && setOpen((value) => !value)}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className={styles.dropdownTriggerText}>{triggerText}</span>
          <span className={styles.dropdownChevron}>{open ? "▲" : "▼"}</span>
        </button>

        {open ? (
          <div className={styles.dropdownPanel} role="listbox">
            {searchable ? (
              <input
                type="search"
                className={styles.dropdownSearch}
                placeholder={searchPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
              />
            ) : null}
            <div className={styles.dropdownToolbar}>
              <span>{selectedIds.length} selected</span>
              <span>
                <button type="button" className={styles.toolbarLink} onClick={selectAllVisible}>
                  Select all
                </button>
                {" · "}
                <button type="button" className={styles.toolbarLink} onClick={clearVisible}>
                  Clear
                </button>
              </span>
            </div>
            {toolbarExtra}
            {filteredItems.length === 0 ? (
              <p className={styles.dropdownEmpty}>{emptyMessage}</p>
            ) : (
              <ul className={styles.dropdownList}>
                {filteredItems.map((item) => (
                  <li key={item.id} className={styles.dropdownItem}>
                    <label className={styles.dropdownItemLabel}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleItem(item.id)}
                      />
                      <span>
                        <strong>{getItemLabel(item)}</strong>
                        {renderMeta ? <span className={styles.dropdownItemMeta}>{renderMeta(item)}</span> : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
