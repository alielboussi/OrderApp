export function catalogApiHeaders(actor?: {
  userId?: string | null;
  userEmail?: string | null;
}): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (actor?.userId) headers["x-warehouse-user-id"] = actor.userId;
  if (actor?.userEmail) headers["x-warehouse-user-email"] = actor.userEmail;
  return headers;
}
