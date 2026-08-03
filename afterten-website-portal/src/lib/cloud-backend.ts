export type CloudBackend = "supabase" | "firebase";

export function getCloudBackend(): CloudBackend {
  const value = (process.env.CLOUD_BACKEND ?? process.env.NEXT_PUBLIC_CLOUD_BACKEND ?? "supabase")
    .trim()
    .toLowerCase();
  return value === "firebase" ? "firebase" : "supabase";
}

export function useFirebaseBackend(): boolean {
  return getCloudBackend() === "firebase";
}
