import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const expenditureSchema = new mongoose.Schema({
  exp_id: { type: String },
  category: {
    type: String,
    enum: ["Salaries", "Utilities", "Maintenance", "Supplies", "Events", "Misc"],
    required: true,
  },
  description: { type: String },
  amount: { type: Number, required: true },
  date: { type: Date, required: true },
  paid_to: { type: String },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

withCommonFields(expenditureSchema);

export default mongoose.model("Expenditure", expenditureSchema);
