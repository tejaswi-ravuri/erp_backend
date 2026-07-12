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
attendanceSchema.index({ student_id: 1, date: 1 }, { unique: true }); // one attendance record per student per day

export default mongoose.model("Attendance", attendanceSchema);
