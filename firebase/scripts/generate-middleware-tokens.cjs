/**
 * Generate per-outlet middleware API tokens for SCPGT portal proxy.
 *
 *   node firebase/scripts/generate-middleware-tokens.cjs
 *   node firebase/scripts/generate-middleware-tokens.cjs --outlet-id 648e949d-8648-4c43-80d4-f08feb7bdd04
 *
 * Writes credentials files to exports/middleware-credentials/ (gitignored path — do not commit).
 */
const { randomBytes } = require("crypto");
const { mkdirSync, writeFileSync } = require("fs");
const { resolve } = require("path");
const { createSupabaseAdmin } = require("./lib/supabase-client.cjs");

const DEFAULT_OUTLETS = [
  { id: "648e949d-8648-4c43-80d4-f08feb7bdd04", name: "Till 1" },
  { id: "a655b0a1-a37a-43d6-aa55-7f97377b2660", name: "Till 2" },
  { id: "a406fede-7aab-4473-8e9f-ff645267466f", name: "Quick Corner" },
];

function parseArgs(argv) {
  const outletIdIdx = argv.indexOf("--outlet-id");
  return {
    outletId: outletIdIdx >= 0 ? argv[outletIdIdx + 1]?.trim() : null,
    portalBaseUrl:
      process.env.MIDDLEWARE_PORTAL_BASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      "http://localhost:3000",
  };
}

function generateToken() {
  return `mw_${randomBytes(32).toString("base64url")}`;
}

async function main() {
  const { outletId, portalBaseUrl } = parseArgs(process.argv);
  const supabase = createSupabaseAdmin();

  let outlets = DEFAULT_OUTLETS;
  if (outletId) {
    const { data, error } = await supabase.from("outlets").select("id,name").eq("id", outletId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Outlet not found: ${outletId}`);
    outlets = [data];
  } else {
    const { data, error } = await supabase
      .from("outlets")
      .select("id,name")
      .in(
        "id",
        DEFAULT_OUTLETS.map((row) => row.id),
      );
    if (error) throw new Error(error.message);
    outlets = data?.length ? data : DEFAULT_OUTLETS;
  }

  const outDir = resolve(__dirname, "../../exports/middleware-credentials");
  mkdirSync(outDir, { recursive: true });

  const summary = [];
  for (const outlet of outlets) {
    const token = generateToken();
    const { error } = await supabase
      .from("outlets")
      .update({ middleware_api_token: token, updated_at: new Date().toISOString() })
      .eq("id", outlet.id);
    if (error) throw new Error(`Failed to store token for ${outlet.name}: ${error.message}`);

    const safeName = String(outlet.name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const filePath = resolve(outDir, `${safeName || outlet.id}.json`);
    const credentials = {
      base_url: portalBaseUrl.replace(/\/$/, ""),
      outlet_id: outlet.id,
      outlet_name: outlet.name,
      middleware_token: token,
    };
    writeFileSync(filePath, JSON.stringify(credentials, null, 2), "utf8");
    summary.push({ outlet: outlet.name, id: outlet.id, credentials_file: filePath });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        portal_base_url: portalBaseUrl,
        outlets: summary,
        till_install_hint:
          "Copy the JSON file to C:\\ProgramData\\SCPGT\\middleware-credentials.json and set Portal:CredentialsPath in appsettings.json",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
