/**
 * Build outlet-warehouse-ids.json from Supabase outlets.default_sales_warehouse_id.
 *
 * Run from firebase folder:
 *   node scripts/sync-outlet-warehouse-ids-from-supabase.cjs
 */
const { writeFileSync } = require("fs");
const { resolve } = require("path");
const { getSupabaseConfig } = require("./lib/migrate-supabase-utils.cjs");

const OUTLET_IDS = [
  { id: "648e949d-8648-4c43-80d4-f08feb7bdd04", name: "Till 1" },
  { id: "a655b0a1-a37a-43d6-aa55-7f97377b2660", name: "Till 2" },
  { id: "a406fede-7aab-4473-8e9f-ff645267466f", name: "Quick Corner" },
];

async function main() {
  const supabase = getSupabaseConfig();
  const map = {};

  for (const outlet of OUTLET_IDS) {
    const url = `${supabase.url}/rest/v1/outlets?select=id,name,default_sales_warehouse_id&id=eq.${outlet.id}&limit=1`;
    const response = await fetch(url, {
      headers: {
        apikey: supabase.key,
        Authorization: `Bearer ${supabase.key}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch outlet ${outlet.name}: ${await response.text()}`);
    }
    const rows = await response.json();
    const row = rows[0];
    const warehouseId = row?.default_sales_warehouse_id;
    if (!warehouseId) {
      console.warn(`  ${outlet.name}: no default_sales_warehouse_id`);
      map[outlet.id] = { warehouseIds: [], warehouseName: outlet.name };
      continue;
    }

    const whUrl = `${supabase.url}/rest/v1/warehouses?select=id,name&id=eq.${warehouseId}&limit=1`;
    const whRes = await fetch(whUrl, {
      headers: {
        apikey: supabase.key,
        Authorization: `Bearer ${supabase.key}`,
      },
    });
    const whRows = whRes.ok ? await whRes.json() : [];
    const whName = whRows[0]?.name ?? outlet.name;

    map[outlet.id] = {
      warehouseIds: [warehouseId],
      warehouseName: whName,
    };
    console.log(`  ${outlet.name}: ${warehouseId} (${whName})`);
  }

  const outPath = resolve(__dirname, "outlet-warehouse-ids.json");
  writeFileSync(outPath, JSON.stringify(map, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
