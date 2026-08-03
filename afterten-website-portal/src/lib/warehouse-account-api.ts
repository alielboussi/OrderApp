import { WAREHOUSE_PENDING_APPROVAL_MESSAGE } from "./warehouse-account";

export { WAREHOUSE_PENDING_APPROVAL_MESSAGE };

export type WarehouseAuthProfile = {
  user_id: string;
  email: string | null;
  active: boolean;
  can_view_logs: boolean;
  pending_message: string | null;
};

export async function fetchWarehouseAuthProfile(accessToken: string): Promise<WarehouseAuthProfile> {
  const response = await fetch("/api/warehouse-auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as WarehouseAuthProfile & { error?: string };
  if (!response.ok) {
    const detail = payload.error || `HTTP ${response.status}`;
    if (response.status === 401) {
      throw new Error("Session expired or invalid. Try signing in again.");
    }
    if (response.status === 500) {
      throw new Error(
        "Server could not verify your account. Ensure CLOUD_BACKEND=firebase and Firebase credentials are configured on the server.",
      );
    }
    throw new Error(detail === "Unauthorized" ? "Unable to verify warehouse account" : detail);
  }
  return payload;
}

export async function requireActiveWarehouseAccountFromToken(
  accessToken: string,
): Promise<{ ok: true; profile: WarehouseAuthProfile } | { ok: false; message: string }> {
  try {
    const profile = await fetchWarehouseAuthProfile(accessToken);
    if (!profile.active) {
      return { ok: false, message: profile.pending_message || WAREHOUSE_PENDING_APPROVAL_MESSAGE };
    }
    return { ok: true, profile };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to verify warehouse account",
    };
  }
}
