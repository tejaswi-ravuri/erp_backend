import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const appointmentSchema = new mongoose.Schema({
  visitor_name: { type: String, required: true },
  purpose: { type: String, required: true },
  with_whom: { type: String }, // display name, e.g. "Principal"
  with_whom_user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // used for access scoping
  date: { type: Date, required: true },
  time: { type: String },
  phone: { type: String },
  status: { type: String, enum: ["Scheduled", "Completed", "Cancelled"], default: "Scheduled" },
});

withCommonFields(appointmentSchema);

export default mongoose.model("Appointment", appointmentSchema);
