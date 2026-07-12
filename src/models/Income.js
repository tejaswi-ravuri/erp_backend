import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const incomeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  amount: { type: Number, required: true },
  category: {
    type: String,
    enum: [
      "Application Fee",
      "Admission Fee",
      "Term Fee",
      "Transport Fee",
      "Text Books",
      "Regular Uniform",
      "Sport Uniform",
      "Study and IIT Materials",
      "Ties",
      "Belts",
      "ID Cards",
      "Students Diaries",
      "Magazines",
      "Note Books",
      "Stationary Kits",
      "Abacus and Vedic Maths",
      "SSC Exam Fee",
      "Picnic and Tours",
      "Loans From Out Sides",
      "TC and Bonafide",
      "Other Income",
      "Cash Withdrawal",
    ],
  },
  date: { type: Date, required: true },
  received_from: { type: String },
  payment_method: {
    type: String,
    // enum: ["Cash", "Bank Transfer", "Cheque", "Online"],
  },
  notes: { type: String },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
    index: true,
  },
});

withCommonFields(incomeSchema);

export default mongoose.model("Income", incomeSchema);
