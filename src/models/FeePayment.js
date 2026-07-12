import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";
const PAYMENT_MODES = [
  "Cash",
  "Cheque",
  "Swipe machine",
  "Paytm",
  "GooglePay",
  "PhonePay",
  "OnlineTransfer",
  "Others",
];

const feePaymentSchema = new mongoose.Schema({
  payment_id: { type: String },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
    index: true,
  },

  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
    index: true,
  },
  student_name: { type: String },
  academic_year: { type: String, required: true },
  fee_type: {
    type: String,
    enum: [
      "Tuition",
      "Annual",
      "Transport",
      "Exam",
      "Other",
      "School Fee",
      "Admission Fee",
      "Previous Due",
    ],
    required: true,
  },
  amount: { type: Number, required: true },
  payment_date: { type: Date },
  payment_mode: { type: String, enum: PAYMENT_MODES, default: "Cash" },
  voucher_type: { type: String, enum: ["MvNo", "CvNo"], default: "MvNo" },
  receipt_no: { type: String, index: true },
  // Cheque-specific
  cheque_date: { type: Date },
  transaction_no: { type: String },
  bank_name: { type: String },
  bank_branch: { type: String },
  status: {
    type: String,
    enum: ["Paid", "Pending", "Cancelled"],
    default: "Pending",
  },
});

withCommonFields(feePaymentSchema);

export const FEE_PAYMENT_MODES = PAYMENT_MODES;
export default mongoose.model("FeePayment", feePaymentSchema);
