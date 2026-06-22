"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import styles from "../../enterprise.module.css";

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

export default function CatalogMenuGroupsPage() {
  const router = useRouter();
  const { status, readOnly } = useWarehouseAuth();
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/catalog/menu-groups");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to load menu groups");
      setGroups(Array.isArray(json.groups) ? json.groups : []);
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

  const resetForm = () => setForm(emptyForm);

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
        pos_menu_group_id: form.pos_menu_group_id.trim() ? Number(form.pos_menu_group_id) : null,
        sort_order: Number(form.sort_order) || 0,
        active: form.active,
      };

      const res = await fetch("/api/catalog/menu-groups", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
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
    <div style={{ display: "grid", gap: 16 }}>
      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderBlue}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            POS Menu Groups
          </h3>
          <p className={styles.pageCardBody}>
            MintPOS only shows products when they are linked to a menu group. Create groups here, assign them on finished products, then send updates from Products.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className={styles.btnSecondary} onClick={() => router.push("/Warehouse_Backoffice/catalog/menu")}>
            Products
          </button>
          <button type="button" className={styles.btnSecondary} onClick={() => router.push("/Warehouse_Backoffice")}>
            Dashboard
          </button>
        </div>
      </section>

      {message ? (
        <p className={styles.pageCardBody} style={{ margin: 0, color: "#1a7f37" }}>
          {message}
        </p>
      ) : null}

      <section className={styles.pageCard}>
        <h3 className={styles.pageCardTitle}>{form.id ? "Edit menu group" : "New menu group"}</h3>
        <form onSubmit={submit} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
          <label className={styles.pageCardBody} style={{ margin: 0 }}>
            Name
            <input
              className={styles.fieldInput}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
              style={{ display: "block", marginTop: 6 }}
            />
          </label>
          <label className={styles.pageCardBody} style={{ margin: 0 }}>
            MintPOS group ID (optional)
            <input
              className={styles.fieldInput}
              value={form.pos_menu_group_id}
              onChange={(e) => setForm((prev) => ({ ...prev, pos_menu_group_id: e.target.value }))}
              placeholder="Existing MenuGroup.Id"
              style={{ display: "block", marginTop: 6 }}
            />
          </label>
          <label className={styles.pageCardBody} style={{ margin: 0 }}>
            Sort order
            <input
              className={styles.fieldInput}
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
              style={{ display: "block", marginTop: 6 }}
            />
          </label>
          <label className={styles.pageCardBody} style={{ margin: 0, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} />
            Active
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className={styles.btnAdd} disabled={saving}>
              {saving ? "Saving..." : form.id ? "Update group" : "Create group"}
            </button>
            {form.id ? (
              <button type="button" className={styles.btnSecondary} onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className={styles.pageCard}>
        <h3 className={styles.pageCardTitle}>Existing groups</h3>
        {loading ? <p className={styles.pageCardBody}>Loading...</p> : null}
        {!loading && groups.length === 0 ? <p className={styles.pageCardBody}>No menu groups yet.</p> : null}
        {!loading && groups.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ whiteSpace: "nowrap" }}>MintPOS ID</th>
                  <th style={{ whiteSpace: "nowrap" }}>Sort</th>
                  <th style={{ whiteSpace: "nowrap" }}>Status</th>
                  <th style={{ whiteSpace: "nowrap", width: 88 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td>{group.name}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{group.pos_menu_group_id ?? "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{group.sort_order}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{group.active ? "Active" : "Inactive"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button type="button" className={styles.btnSecondary} onClick={() => startEdit(group)}>
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
