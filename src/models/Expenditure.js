import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

// Same chart of accounts as FeePayment.payment_mode (plus Bank Transfer) -
// kept as an independent list here since expenditure and fee payments are
// separate ledgers and shouldn't drift together by accident.
const PAYMENT_MODES = [
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

const expenditureSchema = new mongoose.Schema({
  exp_id: { type: String },
  category: {
    type: String,
    enum: [
      "Abacus/Vedic Maths Bills",
      "Admission Incentives",
      "Advertisements",
      "Bank Deposits",
      "Branch Visiting Allowance",
      "Building Repairs and Maintenance",
      "Building-I Rent",
      "Building-II Rent",
      "Bus Diesel",
      "Bus EMI-I",
      "Bus EMI-II",
      "Bus Fitness and Permit",
      "Bus Insurance",
      "Bus Repairs and Maintenance",
      "Bus Tax",
      "Chit Payments",
      "Class Room Furniture Bills",
      "Consultancy Bills",
      "DCEB Expenses",
      "Donations and Charities",
      "Drinking Water Bills",
      "Electricity Bills",
      "Electrical Equipments",
      "Electrical Repairs and Maintenance",
      "ERP AMC",
      "Functions and Celebrations",
      "Furniture Repairs and Maintenance",
      "Ground Rent",
      "Hire Vehicle Bills",
      "Housekeeping Bills",
      "ID/Badges Bills",
      "Interest on Loans",
      "Loans Repayments",
      "Look and Feel Bills",
      "Magazine Bills",
      "Management Fee",
      "Mobile and Internet Bills",
      "Municipal Water Bills",
      "Note Books Bills",
      "Office Furniture Bills",
      "Office Records Bills",
      "Other Miscellaneous Bills",
      "PF & ESI Payments",
      "Picnic and Tours Expenses",
      "Printing and Stationary Bills",
      "Profit Share",
      "Property Tax Bills",
      "Question Papers Bills",
      "Recognition Express",
      "Regular Uniform Bills",
      "Salaries and Wages",
      "School Activity Bills",
      "School Maintenance",
      "Sports Uniform Bills",
      "SSC Exam Fee Expenses",
      "Staff Welfare Bills",
      "Stationary Bills",
      "Student Diaries Bills",
      "Study and IIT Material Bills",
      "TDS Payments",
      "Text Books Bills",
      "Tie and Belts Bills",
      "Training Program Expenses",
      "Transport and Courier Expenses",
      "Travelling Allowance",
    ],
    required: true,
  },
  description: { type: String },
  amount: { type: Number, required: true },
  date: { type: Date, required: true },
  paid_to: { type: String },
  payment_mode: { type: String, enum: PAYMENT_MODES, default: "Cash" },
  // Payment-mode-specific details - which of these apply depends on
  // payment_mode (see PAYMENT_MODE_FIELDS in expenditureController.js),
  // mirroring FeePayment's Cheque/OnlineTransfer proof fields.
  transaction_no: { type: String },
  cheque_date: { type: Date },
  bank_name: { type: String },
  bank_branch: { type: String },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
    index: true,
  },

  // Delete-approval workflow: deleting a record is a two-step process -
  // any role with delete permission can request it, but only an Admin
  // Officer assigned to the record's branch can approve (or reject) it.
  // The record is only actually removed once approved.
  delete_requested: { type: Boolean, default: false },
  delete_requested_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  delete_requested_at: { type: Date, default: null },
});

withCommonFields(expenditureSchema);

export default mongoose.model("Expenditure", expenditureSchema);
