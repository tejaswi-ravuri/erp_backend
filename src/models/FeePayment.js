import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const feePaymentSchema = new mongoose.Schema({
  payment_id: { type: String },
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
  student_name: { type: String },
  academic_year: { type: String, required: true },
  fee_type: { type: String, enum: ["Tuition", "Annual", "Transport", "Exam", "Other"], required: true },
  amount: { type: Number, required: true },
  payment_date: { type: Date },
  payment_mode: { type: String, enum: ["Cash", "Online", "Cheque"], default: "Cash" },
  receipt_no: { type: String, index: true },
  status: { type: String, enum: ["Paid", "Pending"], default: "Pending" },
});

withCommonFields(feePaymentSchema);

export default mongoose.model("FeePayment", feePaymentSchema);
