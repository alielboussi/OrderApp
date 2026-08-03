/**
 * Create or reset a warehouse backoffice portal login (Firebase Auth email/password).
 *
 * Supabase passwords are NOT migrated — run this once per portal user after Firebase cutover.
 *
 *   cd C:\Projects\Afterten\firebase
 *   $env:EMAIL="you@example.com"; $env:PASSWORD="YourNewPassword"; node scripts/set-warehouse-portal-password.cjs
 *
 * Optional:
 *   ACTIVE=1  — mark warehouse_auth_accounts active immediately (default: inherit from migrated row by email)
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const email = (process.env.EMAIL ?? process.argv[2] ?? "").trim().toLowerCase();
const password = process.env.PASSWORD ?? process.argv[3] ?? "";
const forceActive = process.env.ACTIVE === "1" || process.env.ACTIVE === "true";

if (!email || !password) {
  console.error("Usage: EMAIL=... PASSWORD=... node scripts/set-warehouse-portal-password.cjs");
  console.error("   or: node scripts/set-warehouse-portal-password.cjs you@example.com YourPassword");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const auth = admin.auth();
const db = admin.firestore();

async function findMigratedAccountByEmail(normalizedEmail) {
  const snap = await db
    .collection("warehouse_auth_accounts")
    .where("emailNormalized", "==", normalizedEmail)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, data: doc.data() };
}

async function ensureWarehouseAuthAccount(uid, normalizedEmail, inherited) {
  const now = new Date().toISOString();
  const active = forceActive || inherited?.data?.active === true;
  const canViewAuditLogs =
    inherited?.data?.canViewAuditLogs === true || inherited?.data?.can_view_audit_logs === true;

  await db
    .collection("warehouse_auth_accounts")
    .doc(uid)
    .set(
      {
        userId: uid,
        email,
        emailNormalized: normalizedEmail,
        active,
        createdAt: inherited?.data?.createdAt ?? now,
        activatedAt: active ? inherited?.data?.activatedAt ?? now : null,
        canViewAuditLogs,
        inheritedFromUserId: inherited?.id ?? null,
        updatedAt: now,
      },
      { merge: true },
    );

  return { active, inheritedFrom: inherited?.id ?? null };
}

async function main() {
  const migrated = await findMigratedAccountByEmail(email);
  let user;

  try {
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password, emailVerified: true, disabled: false });
    console.log(`Updated password for existing Firebase user ${user.uid}`);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    user = await auth.createUser({ email, password, emailVerified: true });
    console.log(`Created Firebase user ${user.uid}`);
  }

  const account = await ensureWarehouseAuthAccount(user.uid, email, migrated);

  console.log("\nWarehouse portal login ready:");
  console.log(`  Email:    ${email}`);
  console.log(`  UID:      ${user.uid}`);
  console.log(`  Active:   ${account.active}`);
  if (account.inheritedFrom) {
    console.log(`  Inherited approval from legacy account: ${account.inheritedFrom}`);
  }
  if (!account.active) {
    console.log("\nAccount is pending approval. Approve in portal or re-run with ACTIVE=1");
  }
  console.log("\nSign in at /Warehouse_Backoffice/login with email + password.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
