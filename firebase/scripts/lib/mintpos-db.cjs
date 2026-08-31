/**
 * Read MintPOS catalog rows from SQL Server (MenuItem / ModifierFlavour / MenuGroup).
 */
const { readFileSync, existsSync } = require("fs");
const { resolve } = require("path");
const { createRequire } = require("module");

const rootRequire = createRequire(resolve(__dirname, "../../../package.json"));

function requireMssql() {
  try {
    return rootRequire("mssql");
  } catch {
    throw new Error(
      "mssql package is required. Run: npm install mssql --save-dev (from repo root)",
    );
  }
}

const MENU_GROUPS_SQL = `
SELECT
    mg.Id AS pos_menu_group_id,
    LTRIM(RTRIM(mg.Name)) AS group_name
FROM dbo.MenuGroup mg WITH (NOLOCK)
WHERE NULLIF(LTRIM(RTRIM(mg.Name)), '') IS NOT NULL
ORDER BY mg.Id;
`;

const CATALOG_ROWS_SQL = `
SELECT
    mi.Id AS pos_item_id,
    LTRIM(RTRIM(mi.Code)) AS item_sku,
    LTRIM(RTRIM(mi.Name)) AS item_name,
    mi.MenuGroupId AS pos_menu_group_id,
    COALESCE(
      NULLIF(mi.GrossPrice, 0),
      CASE WHEN mi.Price IS NOT NULL AND mi.Price > 0 THEN ROUND(mi.Price * 1.16, 2) ELSE NULL END,
      0
    ) AS selling_price,
    COALESCE(mi.Status, 'Active') AS item_status,
    mf.Id AS pos_flavour_id,
    LTRIM(RTRIM(mf.Name)) AS variant_name,
    COALESCE(NULLIF(LTRIM(RTRIM(mf.Name2)), ''), CAST(mf.Id AS nvarchar(100))) AS variant_sku,
    COALESCE(
      NULLIF(mf.GrossPrice, 0),
      CASE WHEN mf.Price IS NOT NULL AND mf.Price > 0 THEN ROUND(mf.Price * 1.16, 2) ELSE NULL END,
      NULL
    ) AS variant_selling_price,
    COALESCE(mf.Status, 'Active') AS variant_status
FROM dbo.MenuItem mi WITH (NOLOCK)
LEFT JOIN dbo.ModifierFlavour mf WITH (NOLOCK) ON mf.MenuItemId = mi.Id
WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NOT NULL
  AND COALESCE(mi.Status, 'Active') = 'Active'
  AND (mf.Id IS NULL OR COALESCE(mf.Status, 'Active') = 'Active')
ORDER BY mi.Id, mf.Id;
`;

function cleanText(value) {
  return String(value ?? "").trim();
}

function parseAppsettings(filePath) {
  const text = readFileSync(filePath, "utf8");
  const json = JSON.parse(text);
  const pos = json.PosDb ?? json.posDb ?? {};
  return {
    server: cleanText(pos.Server ?? pos.server),
    database: cleanText(pos.Database ?? pos.database) || "MINTPOS",
    username: cleanText(pos.Username ?? pos.username),
    password: String(pos.Password ?? pos.password ?? ""),
    trustServerCertificate:
      pos.TrustServerCertificate ?? pos.trustServerCertificate ?? true,
    encrypt: pos.Encrypt ?? pos.encrypt ?? false,
    integratedSecurity: pos.IntegratedSecurity ?? pos.integratedSecurity ?? false,
    connectionString: cleanText(pos.ConnectionString ?? pos.connectionString),
  };
}

function resolveMintPosConfig(options = {}) {
  const appsettingsPath =
    options.appsettingsPath ||
    process.env.MINTPOS_APPSETTINGS_PATH?.trim() ||
    "C:\\ProgramData\\SCPGT\\appsettings.json";

  let config = null;
  if (options.appsettingsPath || existsSync(appsettingsPath)) {
    if (!existsSync(appsettingsPath)) {
      throw new Error(`MintPOS appsettings not found: ${appsettingsPath}`);
    }
    config = parseAppsettings(appsettingsPath);
  }

  const server = cleanText(process.env.MINTPOS_DB_SERVER) || config?.server;
  const database = cleanText(process.env.MINTPOS_DB_DATABASE) || config?.database || "MINTPOS";
  const username = cleanText(process.env.MINTPOS_DB_USERNAME) || config?.username;
  const password =
    process.env.MINTPOS_DB_PASSWORD != null && process.env.MINTPOS_DB_PASSWORD !== ""
      ? process.env.MINTPOS_DB_PASSWORD
      : config?.password ?? "";
  const connectionString =
    cleanText(process.env.MINTPOS_DB_CONNECTION_STRING) || config?.connectionString;

  if (connectionString) {
    return { connectionString };
  }

  if (!server) {
    throw new Error(
      "MintPOS SQL connection not configured. Set MINTPOS_DB_SERVER (+ user/password) or pass --appsettings path.",
    );
  }

  const integratedSecurity =
    process.env.MINTPOS_DB_INTEGRATED_SECURITY === "1" || config?.integratedSecurity === true;

  return {
    server,
    database,
    user: integratedSecurity ? undefined : username,
    password: integratedSecurity ? undefined : password,
    options: {
      encrypt: process.env.MINTPOS_DB_ENCRYPT === "1" || config?.encrypt === true,
      trustServerCertificate:
        process.env.MINTPOS_DB_TRUST_SERVER_CERTIFICATE !== "0" &&
        config?.trustServerCertificate !== false,
      ...(integratedSecurity ? { trustedConnection: true } : {}),
    },
  };
}

async function connectMintPos(options = {}) {
  const sql = requireMssql();
  const config = resolveMintPosConfig(options);
  const pool = await sql.connect(config);
  return { sql, pool };
}

function normalizeCatalogRows(rawRows) {
  const byItemSku = new Map();

  for (const row of rawRows ?? []) {
    const itemSku = cleanText(row.item_sku ?? row.ItemSku);
    const itemName = cleanText(row.item_name ?? row.ItemName);
    if (!itemSku || !itemName) continue;

    const itemStatus = cleanText(row.item_status ?? row.ItemStatus ?? "Active");
    if (itemStatus && itemStatus.toLowerCase() !== "active") continue;

    let entry = byItemSku.get(itemSku);
    if (!entry) {
      entry = {
        pos_item_id: row.pos_item_id ?? row.PosItemId ?? null,
        item_sku: itemSku,
        item_name: itemName,
        pos_menu_group_id: row.pos_menu_group_id ?? row.PosMenuGroupId ?? null,
        selling_price: Number(row.selling_price ?? row.SellingPrice ?? 0) || 0,
        variants: [],
      };
      byItemSku.set(itemSku, entry);
    }

    const variantName = cleanText(row.variant_name ?? row.VariantName);
    const variantSku = cleanText(row.variant_sku ?? row.VariantSku);
    const variantStatus = cleanText(row.variant_status ?? row.VariantStatus ?? "Active");
    if (!variantName || !variantSku) continue;
    if (variantStatus && variantStatus.toLowerCase() !== "active") continue;

    const variantPriceRaw = row.variant_selling_price ?? row.VariantSellingPrice;
    const variantSellingPrice =
      variantPriceRaw == null || variantPriceRaw === ""
        ? entry.selling_price
        : Number(variantPriceRaw) || entry.selling_price;

    entry.variants.push({
      pos_flavour_id: row.pos_flavour_id ?? row.PosFlavourId ?? null,
      variant_name: variantName,
      variant_sku: variantSku,
      selling_price: variantSellingPrice,
    });
  }

  for (const entry of byItemSku.values()) {
    if (!entry.variants.length) {
      entry.variants.push({
        pos_flavour_id: entry.pos_item_id,
        variant_name: entry.item_name,
        variant_sku: entry.item_sku,
        selling_price: entry.selling_price,
      });
    }
  }

  return Array.from(byItemSku.values());
}

function normalizeMenuGroups(rawRows) {
  const byPosId = new Map();
  for (const row of rawRows ?? []) {
    const posId = Number(row.pos_menu_group_id ?? row.PosMenuGroupId);
    const groupName = cleanText(row.group_name ?? row.GroupName);
    if (!Number.isFinite(posId) || posId <= 0 || !groupName) continue;
    byPosId.set(posId, { pos_menu_group_id: posId, group_name: groupName });
  }
  return Array.from(byPosId.values()).sort((a, b) => a.pos_menu_group_id - b.pos_menu_group_id);
}

async function readMintPosCatalog(options = {}) {
  const { pool } = await connectMintPos(options);
  try {
    const menuGroupsResult = await pool.request().query(MENU_GROUPS_SQL);
    const catalogResult = await pool.request().query(CATALOG_ROWS_SQL);
    return {
      menu_groups: normalizeMenuGroups(menuGroupsResult.recordset),
      catalog_rows: normalizeCatalogRows(catalogResult.recordset),
    };
  } finally {
    await pool.close();
  }
}

function parseMintPosCatalogJsonText(rawText) {
  let text = String(rawText ?? "").replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("JSON file is empty");

  // SSMS "Results to File" often prefixes the FOR JSON column name on line 1.
  if (!text.startsWith("{") && !text.startsWith("[")) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const jsonLine = lines.find((line) => line.startsWith("{") || line.startsWith("["));
    if (!jsonLine) {
      throw new Error("No JSON object/array found in export file");
    }
    text = jsonLine;
  }

  // SSMS text export may wrap long JSON across multiple lines — join before parse.
  if (text.includes("\n") || text.includes("\r")) {
    text = text.replace(/\r?\n/g, "");
  }

  return JSON.parse(text);
}

function loadMintPosCatalogFromJson(filePath) {
  const json = parseMintPosCatalogJsonText(readFileSync(filePath, "utf8"));
  if (Array.isArray(json)) {
    return {
      menu_groups: [],
      catalog_rows: normalizeCatalogRows(json),
    };
  }
  return {
    menu_groups: normalizeMenuGroups(json.menu_groups ?? json.menuGroups ?? []),
    catalog_rows: normalizeCatalogRows(json.catalog_rows ?? json.catalogRows ?? json.rows ?? []),
  };
}

module.exports = {
  CATALOG_ROWS_SQL,
  MENU_GROUPS_SQL,
  parseMintPosCatalogJsonText,
  loadMintPosCatalogFromJson,
  normalizeCatalogRows,
  normalizeMenuGroups,
  readMintPosCatalog,
  resolveMintPosConfig,
};
