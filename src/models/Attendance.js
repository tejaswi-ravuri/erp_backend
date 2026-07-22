import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const attendanceSchema = new mongoose.Schema({
  attendance_id: { type: String },
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
    index: true,
  },
  student_name: { type: String },
  class: { type: String, index: true },
  subject: { type: String, required: true, trim: true },
  date: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ["Present", "Absent", "Late"],
    default: "Present",
  },
  marked_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

withCommonFields(attendanceSchema);
// One attendance record per student per subject per day - bulkMark's upsert
// filter is { class, subject, date, student_id }, so the unique index must
// include subject too, otherwise marking a second subject for the same
// student on the same day collides with the first as a duplicate key.
attendanceSchema.index(
  { student_id: 1, date: 1, subject: 1 },
  { unique: true },
);

export default mongoose.model("Attendance", attendanceSchema);
