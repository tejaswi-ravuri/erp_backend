// models/Branch.js
import mongoose from "mongoose";
import { addressSchema } from "./_addressSchema.js";

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    address: { type: addressSchema, required: true },
    phone: { type: String, trim: true },
    is_active: { type: Boolean, default: true },
    schoolName: {
      type: String,
      default: true,
    },
  },
  { timestamps: { createdAt: "created_date", updatedAt: "updated_date" } },
);

branchSchema.index({ "address.state": 1 });
branchSchema.index({ "address.district": 1 });

export default mongoose.model("Branch", branchSchema);
