import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

// Same chart of payment methods as Expenditure.payment_mode - kept as an
// independent list since Income and Expenditure are separate ledgers.
const PAYMENT_METHODS = [
  "Cash",
  "Cheque",
  "Bank Transfer",
  "Swipe machine",
  "Paytm",
  "GooglePay",
  "PhonePay",
  "OnlineTransfer",
  "Others",
];

const incomeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  amount: { type: Number, required: true },
  category: {
    type: String,
    enum: [
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
      "Annual Fee",
      "Graduation Fee",
    ],
  },
  date: { type: Date, required: true },
  received_from: { type: String },
  payment_method: { type: String, enum: PAYMENT_METHODS, default: "Cash" },
  // Payment-method-specific details - which of these apply depends on
  // payment_method (see PAYMENT_METHOD_FIELDS in incomeController.js).
  transaction_no: { type: String },
  cheque_date: { type: Date },
  bank_name: { type: String },
  bank_branch: { type: String },
  notes: { type: String },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
    index: true,
  },

  // Delete-approval workflow: deleting a record is a two-step process -
  // any role with delete permission can request it, but only an Admin
  // Officer assigned to the record's branch can approve (or reject) it.
  delete_requested: { type: Boolean, default: false },
  delete_requested_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  delete_requested_at: { type: Date, default: null },
});

withCommonFields(incomeSchema);

export default mongoose.model("Income", incomeSchema);
