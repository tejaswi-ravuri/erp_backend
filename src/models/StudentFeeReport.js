import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const studentFeeReportSchema = new mongoose.Schema({
  sno: { type: Number },
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
  student_name: { type: String, required: true },
  father_name: { type: String, required: true },
  mob_number: { type: String, required: true },
  class: { type: String, required: true, index: true },
  student_type: { type: String, enum: ["Existing", "New"], required: true },
  old_fee: { type: Number },
  adm_gross_fee: { type: Number, required: true },
  adm_concession: { type: Number, default: 0 },
  net_adm_fee: { type: Number },
  paid_adm_fee: { type: Number, required: true },
  balance_adm_fee: { type: Number },
  gross_term_fee: { type: Number, required: true },
  term_concession: { type: Number, default: 0 },
  net_term_fee: { type: Number },
  paid_term_fee: { type: Number, required: true },
  balance_term_fee: { type: Number },
  remarks: { type: String, maxlength: 100 },
  status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
});

// Auto-derive the fields that are always computable from the others,
// so the frontend doesn't have to (and can't get them out of sync).
studentFeeReportSchema.pre("validate", function (next) {
  this.net_adm_fee = (this.adm_gross_fee || 0) - (this.adm_concession || 0);
  this.balance_adm_fee = this.net_adm_fee - (this.paid_adm_fee || 0);
  this.net_term_fee = (this.gross_term_fee || 0) - (this.term_concession || 0);
  this.balance_term_fee = this.net_term_fee - (this.paid_term_fee || 0);
  next();
});

withCommonFields(studentFeeReportSchema);

export default mongoose.model("StudentFeeReport", studentFeeReportSchema);
