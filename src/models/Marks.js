import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

// Marks — also added teacher_id + branch to match your original diagram's target shape
const marksSchema = new mongoose.Schema({
  marks_id: { type: String },
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
    index: true,
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Class",
    required: true,
    index: true,
  },
  teacher_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true,
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
    index: true,
  },
  exam_type: {
    type: String,
    enum: ["Unit Test", "Mid Term", "Final"],
    required: true,
  },
  subject: {
    type: String,
    enum: [
      "Maths",
      "Science",
      "English",
      "Hindi",
      "Social Studies",
      "Computer",
    ],
    required: true,
  },
  marks_obtained: { type: Number, required: true },
  max_marks: { type: Number, required: true },
  grade: { type: String },
});

withCommonFields(marksSchema);

export default mongoose.model("Marks", marksSchema);
