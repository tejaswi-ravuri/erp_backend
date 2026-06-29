import mongoose from "mongoose";
import { BRANCHES } from "../config/constants.js";

/**
 * Mongoose plugin applied to every business entity (Student, Staff, FeePayment, ...).
 * Adds the fields needed for:
 *  - strict branch isolation (`branch`)
 *  - soft delete + restore (`is_deleted`, `deleted_at`)
 *  - audit trail (`created_by`, `updated_by`)
 *  - createdAt/updatedAt under the `created_date`/`updated_date` names the
 *    frontend already expects (it was built against Base44, which uses those names).
 */
export function withCommonFields(schema, { branchRequired = true } = {}) {
  schema.add({
    branch: {
      type: String,
      enum: BRANCHES,
      required: branchRequired,
      index: true,
    },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    is_deleted: { type: Boolean, default: false, index: true },
    deleted_at: { type: Date, default: null },
  });

  schema.set("timestamps", { createdAt: "created_date", updatedAt: "updated_date" });

  // NOTE: Soft-delete exclusion is handled explicitly in
  // middleware/branchScope.js (buildScopeFilter), not via query middleware
  // here. Mongoose's pre('find')/pre('findOne') hooks do NOT run for
  // findOneAndUpdate/updateMany/insertMany, which the entity controller uses
  // heavily - relying on schema-level hooks would silently miss those and
  // let soft-deleted records be updated. Keeping the exclusion in one
  // explicit place (buildScopeFilter) avoids that footgun.

  return schema;
}
