"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import eb from "../../enterprise.module.css";
import pageStyles from "./menu-groups.module.css";
import { catalogApiHeaders } from "@/lib/catalog-api-headers";
import { firstMissingPosMenuGroupId } from "@/lib/pos-catalog-ids";
import { findDuplicateMenuGroupSets } from "@/lib/menu-group-dedup";

type MenuGroup = {
  id: string;
  name: string;
  pos_menu_group_id: number | null;
  active: boolean;
  sort_order: number;
};

const emptyForm = {
  id: "",
  name: "",
  pos_menu_group_id: "",
  sort_order: "0",
  active: true,
};

function newGroupForm(groups: MenuGroup[]) {
  return {
    ...emptyForm,
    pos_menu_group_id: String(firstMissingPosMenuGroupId(groups)),
  };
}

export default function CatalogMenuGroupsPage() {
  const { status, readOnly, userId, userEmail } = useWarehouseAuth();
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/catalog/menu-groups");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to load menu groups");
      const nextGroups = Array.isArray(json.groups) ? json.groups : [];
      setGroups(nextGroups);
      setForm((prev) => (prev.id ? prev : newGroupForm(nextGroups)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load menu groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "ok") load();
  }, [status, load]);

  const startEdit = (group: MenuGroup) => {
    setForm({
      id: group.id,
      name: group.name,
      pos_menu_group_id: group.pos_menu_group_id?.toString() ?? "",
      sort_order: String(group.sort_order ?? 0),
      active: group.active !== false,
    });
  };

  const resetForm = () => {
    setForm(newGroupForm(groups));
  };

  const duplicateSets = findDuplicateMenuGroupSets(groups);
  const duplicateCount = duplicateSets.reduce((sum, set) => sum + set.length - 1, 0);

  const removeDuplicates = async () => {
    if (readOnly) {
      setMessage("Read-only access: cleanup is disabled.");
      return;
    }

    const preview =
      duplicateCount > 0
        ? duplicateSets
            .map((set) => {
              const names = set.map((group) => group.name).join(" / ");
              const posId = set[0]?.pos_menu_group_id;
              return `MintPOS ID ${posId}: ${names}`;
            })
            .join("\n")
        : "Inactive groups and portal-only groups will be cleaned up.";

    const confirmed = window.confirm(
      `Clean up menu groups?\n\n` +
        `• Remove duplicate groups (keeps explicitly Active portal rows over MintPOS stubs)\n` +
        `• Migrate portal-only groups onto MintPOS numeric IDs (e.g. Pies → doc "1")\n` +
        `• Only delete inactive groups that have no products still assigned\n\n` +
        `${preview}\n\n` +
        "Products in removed duplicate groups will be moved to the kept group for each MintPOS ID."
    );
    if (!confirmed) return;

    setDeduping(true);
    setMessage(null);
    try {
      const res = await fetch("/api/catalog/menu-groups/dedupe", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to remove duplicate menu groups");

      const removedCount = Array.isArray(json.removed) ? json.removed.length : 0;
      const relinked = typeof json.items_relinked === "number" ? json.items_relinked : 0;
      const migrated = typeof json.migrated?.length === "number" ? json.migrated.length : Array.isArray(json.migrated) ? json.migrated.length : 0;
      const inactiveDeleted = typeof json.inactive_deleted === "number" ? json.inactive_deleted : 0;
      setMessage(
        removedCount || migrated || inactiveDeleted
          ? `Cleaned up menu groups: removed ${removedCount} duplicate${removedCount === 1 ? "" : "s"}, migrated ${migrated}, deleted ${inactiveDeleted} inactive, relinked ${relinked} product${relinked === 1 ? "" : "s"}.`
          : "No duplicate or inactive menu groups found."
      );
      resetForm();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to remove duplicate menu groups");
    } finally {
      setDeduping(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) {
      setMessage("Read-only access: saving is disabled.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        sort_order: Number(form.sort_order) || 0,
        active: form.active,
      };

      const res = await fetch("/api/catalog/menu-groups", {
        method: form.id ? "PUT" : "POST",
        headers: catalogApiHeaders({ userId, userEmail }),
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to save menu group");

      setMessage(form.id ? "Menu group updated." : "Menu group created.");
      resetForm();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save menu group");
    } finally {
      setSaving(false);
    }
  };

  if (status !== "ok") return null;

  return (
    <div className={pageStyles.pageStack}>
      <section className={eb.pageCard}>
        <div className={eb.sectionHeaderBlue}>
          <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
            POS Menu Groups
          </h3>
          <p className={eb.pageCardBody}>
            MintPOS only shows products when they are linked to a menu group. Create groups here, assign them on finished products, then send updates from Products.
          </p>
        </div>
      </section>

      {message ? <p className={pageStyles.message}>{message}</p> : null}

      <section className={eb.pageCard}>
        <h3 className={eb.pageCardTitle}>{form.id ? "Edit menu group" : "New menu group"}</h3>
        <form onSubmit={submit} className={pageStyles.menuGroupForm}>
          <label className={`${eb.pageCardBody} ${pageStyles.formField}`}>
            Name
            <input
              className={eb.fieldInput}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </label>
          <label className={`${eb.pageCardBody} ${pageStyles.formField}`}>
            MintPOS group ID
            <input
              className={eb.fieldInput}
              type="number"
              min={1}
              value={form.pos_menu_group_id}
              readOnly
              aria-readonly
            />
            <small>
              {form.id
                ? "Assigned automatically when this group was created and cannot be changed."
                : "Will use the lowest missing number in the current MintPOS group ID sequence."}
            </small>
          </label>
          <label className={`${eb.pageCardBody} ${pageStyles.formField}`}>
            Sort order
            <input
              className={eb.fieldInput}
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
            />
          </label>
          <label className={`${eb.pageCardBody} ${pageStyles.formCheckbox}`}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} />
            Active
          </label>
          <div className={pageStyles.formActions}>
            <button type="submit" className={eb.btnAdd} disabled={saving}>
              {saving ? "Saving..." : form.id ? "Update group" : "Create group"}
            </button>
            {form.id ? (
              <button type="button" className={eb.btnSecondary} onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className={eb.pageCard}>
        <h3 className={eb.pageCardTitle}>Existing groups</h3>
        {!readOnly ? (
          <div className={pageStyles.tableActions}>
            <button
              type="button"
              className={eb.btnSecondary}
              onClick={() => void removeDuplicates()}
              disabled={deduping || loading}
            >
              {deduping
                ? "Cleaning up…"
                : duplicateCount > 0
                  ? `Clean up duplicates and inactive (${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"})`
                  : "Clean up inactive groups"}
            </button>
          </div>
        ) : null}
        {loading ? <p className={eb.pageCardBody}>Loading...</p> : null}
        {!loading && groups.length === 0 ? <p className={eb.pageCardBody}>No menu groups yet.</p> : null}
        {!loading && groups.length > 0 ? (
          <div className={eb.tableWrap}>
            <table className={eb.dataTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ whiteSpace: "nowrap" }}>MintPOS ID</th>
                  <th style={{ whiteSpace: "nowrap" }}>Status</th>
                  <th style={{ whiteSpace: "nowrap", width: 88 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td>{group.name}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{group.pos_menu_group_id ?? "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{group.active !== false ? "Active" : "Inactive"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button type="button" className={eb.btnSecondary} onClick={() => startEdit(group)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
