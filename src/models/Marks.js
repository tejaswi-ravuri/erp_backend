import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const marksSchema = new mongoose.Schema({
  marks_id: { type: String },
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
  student_name: { type: String },
  class: { type: String, index: true },
  exam_type: { type: String, enum: ["Unit Test", "Mid Term", "Final"], required: true },
  subject: {
    type: String,
    enum: ["Maths", "Science", "English", "Hindi", "Social Studies", "Computer"],
    required: true,
  },
  marks_obtained: { type: Number, required: true },
  max_marks: { type: Number, required: true },
  grade: { type: String },
});

withCommonFields(marksSchema);

export default mongoose.model("Marks", marksSchema);
