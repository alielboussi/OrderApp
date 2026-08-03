/**
 * Seed Firebase Auth users + app_users profiles + outlet_order_catalog for Expo Orders app.
 *
 * Run from firebase folder:
 *   node scripts/seed-orders-app.cjs
 *
 * Optional env overrides:
 *   OUTLET_EMAIL, OUTLET_PASSWORD, REMOVE_OLD_EMAIL
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const oneWay = JSON.parse(readFileSync(resolve(__dirname, "oneway-outlet.json"), "utf8"));

const OUTLET_ID = process.env.OUTLET_ID ?? oneWay.outletId;
const OUTLET_NAME = process.env.OUTLET_NAME ?? oneWay.name;
const OUTLET_EMAIL = process.env.OUTLET_EMAIL ?? "oneway@gmail.com";
const OUTLET_PASSWORD = process.env.OUTLET_PASSWORD ?? "oneway";
const REMOVE_OLD_EMAIL = process.env.REMOVE_OLD_EMAIL ?? "till1.orders@afterten.local";

const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const auth = admin.auth();

async function removeAuthUser(email) {
  if (!email) return false;
  try {
    const old = await auth.getUserByEmail(email);
    await db.collection("app_users").doc(old.uid).delete();
    await auth.deleteUser(old.uid);
    console.log(`Removed old user: ${email} (${old.uid})`);
    return true;
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      console.log(`Old user not found (already removed): ${email}`);
      return false;
    }
    throw err;
  }
}

async function ensureAuthUser(email, password) {
  try {
    const user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password, emailVerified: true, disabled: false });
    return user;
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    return auth.createUser({ email, password, emailVerified: true });
  }
}

async function main() {
  if (REMOVE_OLD_EMAIL && REMOVE_OLD_EMAIL.toLowerCase() !== OUTLET_EMAIL.toLowerCase()) {
    await removeAuthUser(REMOVE_OLD_EMAIL);
  }

  const user = await ensureAuthUser(OUTLET_EMAIL, OUTLET_PASSWORD);
  const now = new Date().toISOString();

  await db.collection("app_users").doc(user.uid).set(
    {
      email: OUTLET_EMAIL,
      outletId: OUTLET_ID,
      outletName: OUTLET_NAME,
      roles: ["branch"],
      active: true,
      ordersAppPassword: OUTLET_PASSWORD,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  await db.collection("outlet_auth_assignments").doc(`${OUTLET_ID}_${user.uid}`).set(
    {
      outlet_id: OUTLET_ID,
      auth_user_id: user.uid,
      assignment_role: "orders",
      active: true,
      updated_at: now,
    },
    { merge: true },
  );

  await db.collection("outlets").doc(OUTLET_ID).set(
    {
      authUserId: user.uid,
      auth_user_id: user.uid,
      ordersAppEmail: OUTLET_EMAIL,
      orders_app_email: OUTLET_EMAIL,
      ordersAppPassword: OUTLET_PASSWORD,
      orders_app_password: OUTLET_PASSWORD,
      updatedAt: now,
    },
    { merge: true },
  );

  console.log("");
  console.log("Seeded Orders app auth profile:");
  console.log(`  Auth user: ${OUTLET_EMAIL}`);
  console.log(`  UID:       ${user.uid}`);
  console.log(`  Outlet:    ${OUTLET_NAME} (${OUTLET_ID})`);
  console.log("");
  console.log("Configure catalog + outlet assignment in portal:");
  console.log("  Warehouse_Backoffice → Outlets → Outlet Catalog Access");
  console.log(`  Set Firebase Auth UID to ${user.uid} and save product checkboxes.`);
  console.log("");
  console.log("Sign in on the Expo app with the outlet email/password above.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
