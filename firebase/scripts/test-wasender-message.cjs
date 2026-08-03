/**
 * Send a test WhatsApp message through Wasender.
 *
 * Usage (PowerShell):
 *   $env:WASENDER_API_KEY="your_api_key"
 *   $env:WASENDER_GROUP_ID="120363322213463398@g.us"
 *   node firebase/scripts/test-wasender-message.cjs
 */

const apiKey = process.env.WASENDER_API_KEY?.trim();
const groupId = process.env.WASENDER_GROUP_ID?.trim();
const apiBase = (process.env.WASENDER_API_BASE ?? "https://www.wasenderapi.com").replace(/\/$/, "");

if (!apiKey || !groupId) {
  console.error("Set WASENDER_API_KEY and WASENDER_GROUP_ID first.");
  process.exit(1);
}

async function main() {
  const response = await fetch(`${apiBase}/api/send-message`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      to: groupId,
      text: "Afterten test message from test-wasender-message.cjs",
    }),
  });

  const json = await response.json().catch(() => ({}));
  console.log("Status:", response.status);
  console.log(JSON.stringify(json, null, 2));

  if (!response.ok || json.success === false) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
