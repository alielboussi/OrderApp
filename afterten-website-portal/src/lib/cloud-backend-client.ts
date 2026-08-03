export type CloudBackend = "supabase" | "firebase";

export function getClientCloudBackend(): CloudBackend {
  const value = (process.env.NEXT_PUBLIC_CLOUD_BACKEND ?? process.env.CLOUD_BACKEND ?? "supabase")
    .trim()
    .toLowerCase();
  return value === "firebase" ? "firebase" : "supabase";
}

export function useFirebaseAuthClient(): boolean {
  return getClientCloudBackend() === "firebase";
}
