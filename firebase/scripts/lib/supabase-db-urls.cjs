const { loadEnv, getSupabaseConfig } = require("./supabase-client.cjs");

function projectRefFromUrl(url) {
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] ?? null;
}

function buildDbUrls() {
  loadEnv();
  if (process.env.SUPABASE_DB_URL?.trim()) {
    return [process.env.SUPABASE_DB_URL.trim()];
  }
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) return [];
  const { url } = getSupabaseConfig();
  const ref = projectRefFromUrl(url);
  if (!ref) throw new Error("Could not parse project ref from SUPABASE_URL");
  const encoded = encodeURIComponent(password);
  const regions = ["aws-1-eu-west-1", "aws-0-eu-west-1", "aws-1-eu-central-1", "aws-0-eu-central-1"];
  const urls = [];
  for (const region of regions) {
    urls.push(`postgresql://postgres.${ref}:${encoded}@${region}.pooler.supabase.com:5432/postgres`);
    urls.push(`postgresql://postgres.${ref}:${encoded}@${region}.pooler.supabase.com:6543/postgres`);
  }
  return urls;
}

module.exports = { buildDbUrls, projectRefFromUrl };
