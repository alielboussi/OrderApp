import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DEFAULT_STOCK_CATALOG_API_URL =
  "https://afterten-stock-api-896827614552.us-central1.run.app/sync/catalog";

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 0) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignore missing env files
  }
}

for (const path of [".env.local", ".env", "../firebase/functions/.env"]) {
  loadEnvFile(path);
}

const token = process.env.STOCK_SYNC_API_TOKEN?.trim();
if (!token) {
  console.error("STOCK_SYNC_API_TOKEN is required");
  process.exit(1);
}

const credentialsPath =
  process.env.FIREBASE_CREDENTIALS_PATH ?? "C:\\Projects\\Afterten\\secrets\\afterten-firebase-adminsdk.json";

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(readFileSync(credentialsPath, "utf8"))),
    projectId: process.env.FIREBASE_PROJECT_ID ?? "afterten-portal-system",
  });
}

const db = getFirestore();

const url = process.env.STOCK_CATALOG_SYNC_API_URL?.trim() || DEFAULT_STOCK_CATALOG_API_URL;
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
});
if (!response.ok) {
  console.error(`Stock catalog API returned ${response.status}`);
  process.exit(1);
}

const catalog = await response.json();
const apiProducts = (catalog.products ?? []).filter((product) => String(product.uuid ?? "").trim());
const apiUuidSet = new Set(apiProducts.map((product) => String(product.uuid).trim()));

const [itemsSnap, variantsSnap] = await Promise.all([
  db.collection("catalog_items").get(),
  db.collection("catalog_variants").get(),
]);

const items = itemsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const variants = variantsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

function linkedToApi(row) {
  const id = String(row.id ?? "");
  const stockApiUuid = String(row.stock_api_uuid ?? "").trim();
  return apiUuidSet.has(id) || (stockApiUuid && apiUuidSet.has(stockApiUuid));
}

const portalItemsLinked = items.filter(linkedToApi);
const portalVariantsLinked = variants.filter(linkedToApi);
const portalItemsExtra = items.filter((row) => !linkedToApi(row));
const portalVariantsExtra = variants.filter((row) => !linkedToApi(row));
const apiMissingInPortal = apiProducts.filter((product) => {
  const uuid = String(product.uuid).trim();
  return !items.some((row) => row.id === uuid || row.stock_api_uuid === uuid)
    && !variants.some((row) => row.id === uuid || row.stock_api_uuid === uuid);
});

console.log(
  JSON.stringify(
    {
      api_product_count: catalog.productCount ?? apiProducts.length,
      api_products_in_payload: apiProducts.length,
      portal_items_total: items.length,
      portal_variants_total: variants.length,
      portal_items_linked_to_api: portalItemsLinked.length,
      portal_variants_linked_to_api: portalVariantsLinked.length,
      portal_items_not_in_api: portalItemsExtra.length,
      portal_variants_not_in_api: portalVariantsExtra.length,
      api_products_missing_in_portal: apiMissingInPortal.length,
      linked_total: portalItemsLinked.length + portalVariantsLinked.length,
    },
    null,
    2,
  ),
);
