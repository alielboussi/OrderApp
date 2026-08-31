import "server-only";

export type CloudBackend = "firebase" | "supabase";

export function getCloudBackend(): CloudBackend {
  const value = process.env.CLOUD_BACKEND?.trim().toLowerCase();
  return value === "supabase" ? "supabase" : "firebase";
}

export function isSupabaseBackend(): boolean {
  return getCloudBackend() === "supabase";
}

export function cloudBackendMeta(): { cloud_backend: CloudBackend } {
  return { cloud_backend: getCloudBackend() };
}
