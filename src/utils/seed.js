import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import { BRANCHES, ROLES } from "../config/constants.js";

async function seed() {
  await connectDB();

  // Super Admin - created but role is currently gated off via SUPER_ADMIN_ENABLED
  // in config/constants.js, so this account exists but can't log in until you flip that flag.
  const superAdminEmail = (process.env.SEED_SUPER_ADMIN_EMAIL || "superadmin@masterminds.edu").toLowerCase();
  let superAdmin = await User.findOne({ email: superAdminEmail });
  if (!superAdmin) {
    superAdmin = await User.create({
      full_name: "Super Admin",
      email: superAdminEmail,
      password: process.env.SEED_SUPER_ADMIN_PASSWORD || "ChangeThisPassword123!",
      role: ROLES.SUPER_ADMIN,
      branch: null,
    });
    console.log(`[seed] Created Super Admin: ${superAdmin.email} (role inactive until flipped on)`);
  } else {
    console.log(`[seed] Super Admin already exists: ${superAdmin.email}`);
  }

  // One Principal account for the first branch, so there's a working login immediately.
  const principalEmail = (process.env.SEED_PRINCIPAL_EMAIL || "principal.hyderabad@masterminds.edu").toLowerCase();
  let principal = await User.findOne({ email: principalEmail });
  if (!principal) {
    principal = await User.create({
      full_name: "Principal - Hyderabad",
      email: principalEmail,
      password: process.env.SEED_PRINCIPAL_PASSWORD || "ChangeThisPassword123!",
      role: ROLES.PRINCIPAL,
      branch: BRANCHES[0],
    });
    console.log(`[seed] Created Principal: ${principal.email} / branch: ${principal.branch}`);
  } else {
    console.log(`[seed] Principal already exists: ${principal.email}`);
  }

  console.log("\n[seed] Done. Use the Principal account to log in and create");
  console.log("[seed] Admin Officer / Accounts Manager / Teacher / Student accounts");
  console.log("[seed] via POST /api/auth/users.\n");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
