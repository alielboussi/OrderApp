"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import styles from "./vehicles.module.css";

type Vehicle = {
  id: string;
  name: string;
  number_plate: string | null;
  driver_name: string | null;
  photo_urls: string[] | null;
  warehouse_id: string | null;
  active: boolean;
};

type Warehouse = {
  id: string;
  name: string | null;
};

type VehicleForm = {
  name: string;
  number_plate: string;
  driver_name: string;
  photo_urls: string;
  warehouse_id: string;
  active: boolean;
};

const emptyForm: VehicleForm = {
  name: "",
  number_plate: "",
  driver_name: "",
  photo_urls: "",
  warehouse_id: "",
  active: true,
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function parsePhotoUrls(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function formatPhotoUrls(value: string[] | null | undefined): string {
  if (!value || value.length === 0) return "";
  return value.join("\n");
}

export default function VehiclesPage() {
  const { status } = useWarehouseAuth();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [form, setForm] = useState<VehicleForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const warehouseLookup = useMemo(() => {
    return new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name ?? "Warehouse"]));
  }, [warehouses]);

  const canSubmit = form.name.trim().length > 0 && !saving;

  const loadVehicles = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/vehicles?include_inactive=1", { cache: "no-store" });
      if (!response.ok) {
        const info = await response.json().catch(() => ({}));
        throw new Error(info.error || "Unable to load vehicles");
      }
      const payload = await response.json().catch(() => ({}));
      setVehicles(Array.isArray(payload?.vehicles) ? payload.vehicles : []);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const loadWarehouses = async () => {
    try {
      const response = await fetch("/api/warehouses?include_inactive=1", { cache: "no-store" });
      if (!response.ok) {
        const info = await response.json().catch(() => ({}));
        throw new Error(info.error || "Unable to load warehouses");
      }
      const payload = await response.json().catch(() => ({}));
      const rows = Array.isArray(payload?.warehouses)
        ? payload.warehouses
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
      setWarehouses(rows as Warehouse[]);
    } catch (err) {
      setError(toErrorMessage(err));
      setWarehouses([]);
    }
  };

  useEffect(() => {
    if (status !== "ok") return;
    void loadVehicles();
    void loadWarehouses();
  }, [status]);

  const handleChange = (field: keyof VehicleForm) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleActiveChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, active: event.target.checked }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleEdit = (vehicle: Vehicle) => {
    setEditingId(vehicle.id);
    setForm({
      name: vehicle.name ?? "",
      number_plate: vehicle.number_plate ?? "",
      driver_name: vehicle.driver_name ?? "",
      photo_urls: formatPhotoUrls(vehicle.photo_urls),
      warehouse_id: vehicle.warehouse_id ?? "",
      active: vehicle.active ?? true,
    });
    setSuccess(null);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const payload = {
        name: form.name,
        number_plate: form.number_plate,
        driver_name: form.driver_name,
        photo_urls: parsePhotoUrls(form.photo_urls),
        warehouse_id: form.warehouse_id || null,
        active: form.active,
      };
      const response = await fetch("/api/vehicles", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      if (!response.ok) {
        const info = await response.json().catch(() => ({}));
        throw new Error(info.error || (editingId ? "Unable to update vehicle" : "Unable to create vehicle"));
      }
      await loadVehicles();
      resetForm();
      setSuccess(editingId ? "Vehicle updated." : "Vehicle saved.");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const activeCount = useMemo(() => vehicles.filter((vehicle) => vehicle.active).length, [vehicles]);

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Vehicle Directory</h1>
            <p className={styles.subtitle}>
              Add vehicles, plates, and driver names used by the Fuel storeroom scanner.
            </p>
          </div>
          <div className={styles.heroActions}>
            <button onClick={() => router.back()} className={styles.backButton}>
              Back
            </button>
            <button onClick={() => router.push("/Warehouse_Backoffice/catalog")} className={styles.backButton}>
              Back to Catalog
            </button>
          </div>
        </header>

        <section className={styles.contentGrid}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{editingId ? "Edit Vehicle" : "Add Vehicle"}</h2>
              <p className={styles.cardHint}>Assign each vehicle to a destination warehouse for fuel transfers.</p>
            </div>
            {error ? <p className={styles.error}>{error}</p> : null}
            {success ? <p className={styles.success}>{success}</p> : null}
            <form onSubmit={handleSubmit} className={styles.formGrid}>
              <label className={styles.label}>
                Vehicle name
                <input className={styles.input} value={form.name} onChange={handleChange("name")} placeholder="Fuel Truck" />
              </label>
              <label className={styles.label}>
                Number plate
                <input
                  className={styles.input}
                  value={form.number_plate}
                  onChange={handleChange("number_plate")}
                  placeholder="ALB-1234"
                />
              </label>
              <label className={styles.label}>
                Driver name
                <input
                  className={styles.input}
                  value={form.driver_name}
                  onChange={handleChange("driver_name")}
                  placeholder="Optional"
                />
              </label>
              <label className={styles.label}>
                Destination warehouse
                <select className={styles.input} value={form.warehouse_id} onChange={handleChange("warehouse_id")}>
                  <option value="">Select warehouse</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name ?? "Warehouse"}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.labelFull}>
                Photo URLs (one per line)
                <textarea
                  className={styles.textarea}
                  value={form.photo_urls}
                  onChange={handleChange("photo_urls")}
                  placeholder="https://..."
                />
              </label>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={form.active} onChange={handleActiveChange} />
                Active
              </label>
              <div className={styles.formActions}>
                <button className={styles.primaryButton} type="submit" disabled={!canSubmit}>
                  {editingId ? "Update Vehicle" : "Save Vehicle"}
                </button>
                {editingId ? (
                  <button type="button" className={styles.secondaryButton} onClick={resetForm}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          <div className={styles.card}>
            <div className={styles.listHeader}>
              <div>
                <h2 className={styles.cardTitle}>Current Vehicles</h2>
                <p className={styles.cardHint}>
                  {loading ? "Loading vehicles..." : `${vehicles.length} total | ${activeCount} active`}
                </p>
              </div>
              <button type="button" className={styles.secondaryButton} onClick={loadVehicles} disabled={loading}>
                Refresh
              </button>
            </div>
            <div className={styles.listHeaderRow}>
              <span>Vehicle</span>
              <span>Destination</span>
              <span>Status</span>
              <span></span>
            </div>
            <div className={styles.list}>
              {vehicles.length === 0 ? (
                <div className={styles.emptyState}>No vehicles yet. Add one to get started.</div>
              ) : (
                vehicles.map((vehicle) => {
                  const destinationLabel = vehicle.warehouse_id
                    ? warehouseLookup.get(vehicle.warehouse_id) ?? "Unknown"
                    : "Unassigned";
                  const plate = vehicle.number_plate ? `Plate: ${vehicle.number_plate}` : "Plate: —";
                  const driver = vehicle.driver_name ? `Driver: ${vehicle.driver_name}` : "Driver: —";
                  const photos = vehicle.photo_urls?.length
                    ? `${vehicle.photo_urls.length} photos`
                    : "No photos";
                  return (
                    <div key={vehicle.id} className={styles.listItem}>
                      <div>
                        <p className={styles.listTitle}>{vehicle.name}</p>
                        <p className={styles.listMeta}>{plate} | {driver}</p>
                        <p className={styles.listMeta}>{photos}</p>
                      </div>
                      <div className={styles.listMeta}>{destinationLabel}</div>
                      <div className={`${styles.statusPill} ${vehicle.active ? styles.statusActive : styles.statusInactive}`}>
                        {vehicle.active ? "Active" : "Inactive"}
                      </div>
                      <div className={styles.actionsCell}>
                        <button type="button" className={styles.secondaryButton} onClick={() => handleEdit(vehicle)}>
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
