import Branch from "../models/Branch.js";
import { nextSequence } from "./sequence.js";

async function getBranchCode(branchId) {
  const branch = await Branch.findById(branchId).select("code name").lean();
  if (!branch)
    throw new Error(
      "Branch not found - cannot generate a numbered ID without it.",
    );
  return branch.code || branch.name?.slice(0, 3).toUpperCase() || "BR";
}

export async function generateUniqueId() {
  const seq = await nextSequence("admission-unique-id");
  return `UID-${String(seq).padStart(6, "0")}`;
}

export async function generateApplicationNo(branchId) {
  const branchCode = await getBranchCode(branchId);
  const year = new Date().getFullYear();
  const seq = await nextSequence(`application-${branchCode}-${year}`);
  return `${branchCode}${year}${String(seq).padStart(4, "0")}`;
}

export async function generateAdmissionNo(branchId) {
  const branchCode = await getBranchCode(branchId);
  const year = new Date().getFullYear();
  const seq = await nextSequence(`admission-${branchCode}-${year}`);
  return `${branchCode}${year}${String(seq).padStart(4, "0")}`;
}

// roll_no scope: defaulted to PER CLASS (each class's roll numbers start
// at 1 independently) - this wasn't explicitly confirmed, flag if you
// wanted per-branch or school-wide instead.
export async function generateRollNo(classId) {
  const seq = await nextSequence(`roll-${classId}`);
  return String(seq);
}

export async function generateReceiptNo(branchId) {
  const branchCode = await getBranchCode(branchId);
  const year = new Date().getFullYear();
  const seq = await nextSequence(`receipt-${branchCode}-${year}`);
  return `RCT-${branchCode}-${year}-${String(seq).padStart(5, "0")}`;
}
