import { defineSecret } from "firebase-functions/params";

export const wasenderApiKey = defineSecret("WASENDER_API_KEY");
export const wasenderGroupId = defineSecret("WASENDER_GROUP_ID");

const DEFAULT_API_BASE = "https://www.wasenderapi.com";

function apiBaseUrl(): string {
  return (process.env.WASENDER_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, "");
}

export function isWasenderConfigured(): boolean {
  return Boolean(wasenderApiKey.value().trim() && wasenderGroupId.value().trim());
}

export class WasenderNotConfiguredError extends Error {
  constructor() {
    super("WASENDER_API_KEY or WASENDER_GROUP_ID is not configured.");
    this.name = "WasenderNotConfiguredError";
  }
}

export async function sendWasenderGroupMessage(text: string): Promise<void> {
  await sendWasenderGroupPayload({ text });
}

export async function sendWasenderGroupMessageWithImage(text: string, imageUrl: string): Promise<void> {
  const trimmedUrl = imageUrl.trim();
  if (!trimmedUrl) {
    throw new Error("imageUrl is required for image messages.");
  }
  await sendWasenderGroupPayload({ text, imageUrl: trimmedUrl });
}

async function sendWasenderGroupPayload(payload: { text: string; imageUrl?: string }): Promise<void> {
  const apiKey = wasenderApiKey.value().trim();
  const groupId = wasenderGroupId.value().trim();
  if (!apiKey || !groupId) {
    throw new WasenderNotConfiguredError();
  }

  const response = await fetch(`${apiBaseUrl()}/api/send-message`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      to: groupId,
      text: payload.text,
      ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
    }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    error?: string;
  };

  if (!response.ok || body.success === false) {
    const detail = body.message || body.error || `Wasender API failed with status ${response.status}`;
    if (/invalid api key/i.test(detail)) {
      throw new Error("Wasender rejected the API key. Update WASENDER_API_KEY in Firebase secrets.");
    }
    throw new Error(detail);
  }
}
