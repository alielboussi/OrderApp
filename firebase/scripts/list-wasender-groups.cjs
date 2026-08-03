/**
 * List WhatsApp groups visible to your Wasender session.
 *
 * Usage (PowerShell):
 *   $env:WASENDER_API_KEY="your_api_key"
 *   node firebase/scripts/list-wasender-groups.cjs
 *
 * Copy the "jid" value for your target group (ends with @g.us) into:
 *   firebase functions:secrets:set WASENDER_GROUP_ID
 */

const apiKey = process.env.WASENDER_API_KEY?.trim();
const apiBase = (process.env.WASENDER_API_BASE ?? "https://www.wasenderapi.com").replace(/\/$/, "");

if (!apiKey) {
  console.error("Set WASENDER_API_KEY first.");
  console.error('Example: $env:WASENDER_API_KEY="your_key"');
  process.exit(1);
}

async function main() {
  const response = await fetch(`${apiBase}/api/groups`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success === false) {
    console.error("Failed to load groups:", json.message || json.error || response.statusText);
    process.exit(1);
  }

  const groups = Array.isArray(json.data) ? json.data : [];
  if (!groups.length) {
    console.log("No groups found. Make sure your Wasender session is connected and in the group.");
    return;
  }

  console.log(`Found ${groups.length} group(s):\n`);
  for (const group of groups) {
    const jid = group.jid || group.id || "";
    const name = group.name || group.subject || "(unnamed)";
    console.log(`Name: ${name}`);
    console.log(`Group ID (jid): ${jid}`);
    console.log("");
  }

  console.log("Set the group id secret with:");
  console.log('  firebase functions:secrets:set WASENDER_GROUP_ID');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
