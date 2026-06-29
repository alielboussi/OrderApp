import type { SupabaseClient } from "@supabase/supabase-js";

export const WAREHOUSE_PENDING_APPROVAL_MESSAGE =
  "Your account is pending approval. An administrator must activate your account before you can sign in.";

export async function isWarehouseAccountActive(
  supabase: SupabaseClient,
): Promise<{ active: boolean; error: string | null }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    return { active: false, error: userError?.message ?? "Not signed in" };
  }

  const { data, error } = await supabase
    .from("warehouse_auth_accounts")
    .select("active")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { active: false, error: error.message };
  }

  return { active: data?.active === true, error: null };
}

export async function requireActiveWarehouseAccount(
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { active, error } = await isWarehouseAccountActive(supabase);
  if (error) {
    return { ok: false, message: error };
  }
  if (!active) {
    await supabase.auth.signOut();
    return { ok: false, message: WAREHOUSE_PENDING_APPROVAL_MESSAGE };
  }
  return { ok: true };
}
