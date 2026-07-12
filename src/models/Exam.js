import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const examSchema = new mongoose.Schema({
  name: { type: String, required: true },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Class",
    required: true,
    index: true,
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
    index: true,
  },
  subject: { type: String, required: true }, // plain string until a Subject model exists
  date: { type: Date, required: true },
  total_marks: { type: Number },
  passing_marks: { type: Number },
  exam_type: {
    type: String,
    enum: ["Unit Test", "Mid Term", "Annual", "Other"],
  },
});

withCommonFields(examSchema);

export default mongoose.model("Exam", examSchema);
