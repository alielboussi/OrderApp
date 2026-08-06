/**
 * Clear legacy Supabase image_url values from catalog_items / catalog_variants.
 *
 *   cd C:\Projects\Afterten\firebase\functions
 *   node ../scripts/clear-supabase-catalog-image-urls.cjs
 *   DRY_RUN=1 node ../scripts/clear-supabase-catalog-image-urls.cjs
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const DRY_RUN = process.env.DRY_RUN === "1";
const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, "utf8"))) });
const db = admin.firestore();

function isSupabaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    return new URL(value.trim()).hostname.toLowerCase().endsWith(".supabase.co");
  } catch {
    return false;
  }
}

async function clearCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  let cleared = 0;
  const batchSize = 400;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    const imageUrl = doc.get("image_url");
    if (!isSupabaseUrl(imageUrl)) continue;
    cleared += 1;
    console.log(`  ${collectionName}/${doc.id}: ${imageUrl}`);
    if (!DRY_RUN) {
      batch.update(doc.ref, { image_url: null, updated_at: new Date().toISOString() });
      batchCount += 1;
      if (batchCount >= batchSize) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
  }

  return cleared;
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no writes" : "Clearing Supabase catalog image URLs...");
  const itemCount = await clearCollection("catalog_items");
  const variantCount = await clearCollection("catalog_variants");
  console.log(`Done. Cleared ${itemCount} item(s) and ${variantCount} variant(s).`);
  if (!DRY_RUN && (itemCount > 0 || variantCount > 0)) {
    console.log("Run refresh-outlet-order-catalogs.cjs next so the Orders app picks up the change.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
