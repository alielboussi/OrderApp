type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
};

export function isMissingRelationError(
  error: SupabaseErrorLike | null | undefined,
  ...relationNames: string[]
): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return relationNames.some((name) => new RegExp(name, "i").test(message));
}
