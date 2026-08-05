const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));
const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, "utf8"))) });
const db = admin.firestore();

async function main() {
  for (const id of ["184", "233", "357", "117", "5933ba28-eb11-4c23-b9dc-7c04057b0e6a"]) {
    const item = await db.collection("catalog_items").doc(id).get();
    if (item.exists) console.log("item", id, item.data().name);
  }
  const ice = await db.collection("catalog_variants").where("item_id", "==", "21e1d144-4a9c-46c8-937f-07be7dd355a9").get();
  console.log("ice cream variants", ice.size);
  for (const doc of ice.docs) console.log(doc.id, doc.data().name);
}

main().catch(console.error);
