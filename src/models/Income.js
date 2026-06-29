import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const incomeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, enum: ["School Fee", "Transport Fee", "Exam Fee", "Other"] },
  date: { type: Date, required: true },
  received_from: { type: String },
  payment_method: { type: String, enum: ["Cash", "Bank Transfer", "Cheque", "Online"] },
  notes: { type: String },
});

withCommonFields(incomeSchema);

export default mongoose.model("Income", incomeSchema);
