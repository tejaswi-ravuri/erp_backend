import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const subjectScheduleSchema = new mongoose.Schema(
  {
    subject: { type: String },
    date: { type: String },
    time: { type: String },
    duration: { type: String },
    max_marks: { type: Number },
  },
  { _id: false },
);

const examScheduleSchema = new mongoose.Schema({
  exam_name: { type: String, required: true },
  class: { type: String, required: true, index: true },
  section: { type: String },
  academic_year: { type: String, required: true },
  exam_type: { type: String, enum: ["Unit Test", "Mid Term", "Final", "Annual"], required: true },
  center: { type: String },
  invigilator: { type: String },
  subjects: { type: [subjectScheduleSchema], default: [] },
});

withCommonFields(examScheduleSchema);

export default mongoose.model("ExamSchedule", examScheduleSchema);
