import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const homeworkNotificationSchema = new mongoose.Schema({
  homework_id: { type: mongoose.Schema.Types.ObjectId, ref: "Homework", index: true },
  title: { type: String, required: true },
  subject: { type: String, required: true },
  description: { type: String },
  class: { type: String, required: true },
  section: { type: String },
  due_date: { type: Date },
  assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
  student_name: { type: String },
  status: { type: String, enum: ["Unread", "Read"], default: "Unread" },
});

withCommonFields(homeworkNotificationSchema);

export default mongoose.model("HomeworkNotification", homeworkNotificationSchema);
