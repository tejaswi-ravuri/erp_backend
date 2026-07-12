// models/_addressSchema.js
import mongoose from "mongoose";

// Reusable embedded subdocument — not its own collection/model, just a shape
// other schemas plug in wherever they need a validated address.
export const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    district: { type: String, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (v) => /^[1-9][0-9]{5}$/.test(v),
        message: (props) => `"${props.value}" is not a valid 6-digit PIN code.`,
      },
    },
    country: { type: String, trim: true, default: "India" },
  },
  { _id: false },
);
