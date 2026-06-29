"use client";

import { useEffect, useState } from "react";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "../enterprise.module.css";

type ScheduleRow = {
  id: string;
  scheduled_at: string | null;
  updated_at?: string | null;
};

function toInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toUtcIso(localDateTime: string): string | null {
  if (!localDateTime) return null;
  const parsed = new Date(localDateTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export default function MiddlewareUpdatesPage() {
  const { status, readOnly } = useWarehouseAuth();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<ScheduleRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/middleware-catalog-schedule");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Unable to load schedule");
        const row = (json.schedule ?? null) as ScheduleRow | null;
        if (!active) return;
        setSaved(row);
        setValue(toInputValue(row?.scheduled_at));
      } catch (error) {
        if (!active) return;
        setMessage({ ok: false, text: error instanceof Error ? error.message : "Unable to load schedule" });
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [status]);

  const save = async (clear = false) => {
    if (readOnly) {
      setMessage({ ok: false, text: "Read-only access: saving is disabled." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const scheduledAt = clear ? null : toUtcIso(value);
      const res = await fetch("/api/middleware-catalog-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at: scheduledAt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Unable to save schedule");

      const row = (json.schedule ?? null) as ScheduleRow | null;
      setSaved(row);
      setValue(toInputValue(row?.scheduled_at));
      setMessage({
        ok: true,
        text: row?.scheduled_at
          ? "Schedule saved. New catalog updates will be delivered at the selected date/time."
          : "Schedule cleared. New catalog updates will deliver immediately.",
      });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Unable to save schedule" });
    } finally {
      setSaving(false);
    }
  };

  if (status !== "ok") {
    return null;
  }

  return (
    <section className={styles.pageCard}>
      <div className={styles.sectionHeaderBlue}>
        <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
          Middleware catalog schedule
        </h3>
        <p className={styles.pageCardBody}>
          Choose when new item/variant/price updates should be released to all outlet middlewares.
        </p>
      </div>

      {loading ? (
        <p className={styles.pageCardBody}>Loading schedule...</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <label className={styles.pageCardBody} style={{ margin: 0 }}>
            Scheduled release (local time)
            <input
              className={styles.fieldInput}
              type="datetime-local"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={saving || readOnly}
              style={{ display: "block", marginTop: 6, maxWidth: 340 }}
            />
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={styles.btnAdd}
              onClick={() => save(false)}
              disabled={saving || readOnly}
            >
              {saving ? "Saving..." : "Save schedule"}
            </button>
            <button
              type="button"
              className={styles.btnDeduct}
              onClick={() => save(true)}
              disabled={saving || readOnly}
            >
              Clear schedule
            </button>
          </div>

          <p className={styles.pageCardBody} style={{ margin: 0 }}>
            Current schedule:{" "}
            <strong>{saved?.scheduled_at ? new Date(saved.scheduled_at).toLocaleString() : "Immediate delivery"}</strong>
          </p>

          {message ? (
            <p
              className={styles.pageCardBody}
              style={{ margin: 0, color: message.ok ? "#1a7f37" : "#c41e3a" }}
            >
              {message.text}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
