import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureFirebaseAdmin, getFirebaseStorageBucket } from "@/lib/firebase-server";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extensionForType(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "jpg";
}

export async function POST(request: NextRequest) {
  try {
    ensureFirebaseAdmin();
    const formData = await request.formData();
    const file = formData.get("file");
    const entityType = String(formData.get("entity_type") ?? "product").trim().toLowerCase();
    const entityId = String(formData.get("entity_id") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Only JPEG, PNG, WebP, or GIF images are supported" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be 5MB or smaller" }, { status: 400 });
    }

    const folder = entityType === "variant" ? "variants" : "products";
    const idPart = entityId || randomUUID();
    const ext = extensionForType(file.type);
    const path = `catalog-images/${folder}/${idPart}-${Date.now()}.${ext}`;

    const bucket = getFirebaseStorageBucket();
    const storageFile = bucket.file(path);
    const buffer = Buffer.from(await file.arrayBuffer());

    await storageFile.save(buffer, {
      metadata: {
        contentType: file.type,
        cacheControl: "public, max-age=31536000",
      },
    });

    let imageUrl: string;
    try {
      await storageFile.makePublic();
      imageUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
    } catch {
      const [signedUrl] = await storageFile.getSignedUrl({
        action: "read",
        expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
      });
      imageUrl = signedUrl;
    }

    return NextResponse.json({ image_url: imageUrl, path, backend: "firebase" });
  } catch (error) {
    console.error("[catalog/image-upload] POST failed", error);
    return NextResponse.json({ error: "Unable to upload catalog image" }, { status: 500 });
  }
}
