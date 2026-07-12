import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const staffSchema = new mongoose.Schema({
  staff_id: { type: String, trim: true, index: true },
  full_name: { type: String, required: true, trim: true },
  role: { type: String, enum: ["teacher", "Admin", "Support"], required: true },
  subject_taught: { type: String },
  subjects: { type: [String], default: [] },
  classes_taught: { type: [String], default: [] },
  qualification: { type: String },
  phone: { type: String },
  email: { type: String, lowercase: true, trim: true },
  address: { type: String },
  joining_date: { type: Date },
  salary: { type: Number },
  status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
});

withCommonFields(staffSchema);

export default mongoose.model("Staff", staffSchema);
