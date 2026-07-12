import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const homeworkSchema = new mongoose.Schema({
  title: { type: String, required: true },
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
  subject: { type: String, required: true },
  description: { type: String },
  due_date: { type: Date, required: true },
  assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  status: { type: String, enum: ["Active", "Completed"], default: "Active" },
});

withCommonFields(homeworkSchema);

export default mongoose.model("Homework", homeworkSchema);
