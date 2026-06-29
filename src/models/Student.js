import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const studentSchema = new mongoose.Schema({
  admission_no: { type: String, trim: true, index: true },
  full_name: { type: String, required: true, trim: true },
  dob: { type: Date },
  gender: { type: String, enum: ["Male", "Female", "Other"] },
  blood_group: { type: String, enum: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] },
  class: { type: String, required: true, index: true },
  section: { type: String },
  roll_no: { type: String },
  parent_name: { type: String },
  parent_phone: { type: String },
  parent_email: { type: String, lowercase: true, trim: true },
  address: { type: String },
  city: { type: String },
  joining_date: { type: Date },
  status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  photo_url: { type: String },
});

withCommonFields(studentSchema);
studentSchema.index({ branch: 1, class: 1, section: 1 });

export default mongoose.model("Student", studentSchema);
