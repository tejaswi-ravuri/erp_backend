import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const studentFeeReportSchema = new mongoose.Schema({
  sno: { type: Number },
  // FIX: this field was missing entirely. Every controller function
  // (listReports/createReport/updateReport/removeReport) filters or sets
  // `branch` from req.user.branch, but since Mongoose is strict by default,
  // that key was being silently stripped on save and every branch filter
  // was matching against a field that didn't exist on any document -
  // accounts managers would see zero records. Matches the pattern used on
  // every other transactional model (Student, Attendance, Marks, etc).
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
  student_name: { type: String, required: true },
  father_name: { type: String, required: true },
  mob_number: { type: String, required: true },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Class",
    required: true,
    index: true,
  },
  student_type: { type: String, enum: ["Existing", "New"], required: true },
  old_fee: { type: Number },

  // Each fee bucket is opt-in per student via its has_*_fee flag - Admission
  // and Term default true since every report historically always carried
  // both; Transport/Application/Registration are net-new and default false
  // (see listReports in feeController.js for how pre-existing documents
  // that predate these flags are backfilled on read).
  has_admission_fee: { type: Boolean, default: true },
  adm_gross_fee: { type: Number, default: 0 },
  adm_concession: { type: Number, default: 0 },
  net_adm_fee: { type: Number },
  paid_adm_fee: { type: Number, default: 0 },
  balance_adm_fee: { type: Number },

  has_term_fee: { type: Boolean, default: true },
  gross_term_fee: { type: Number, default: 0 },
  term_concession: { type: Number, default: 0 },
  net_term_fee: { type: Number },
  paid_term_fee: { type: Number, default: 0 },
  balance_term_fee: { type: Number },

  has_transport_fee: { type: Boolean, default: false },
  transport_gross_fee: { type: Number, default: 0 },
  transport_concession: { type: Number, default: 0 },
  net_transport_fee: { type: Number },
  paid_transport_fee: { type: Number, default: 0 },
  balance_transport_fee: { type: Number },

  has_application_fee: { type: Boolean, default: false },
  application_gross_fee: { type: Number, default: 0 },
  application_concession: { type: Number, default: 0 },
  net_application_fee: { type: Number },
  paid_application_fee: { type: Number, default: 0 },
  balance_application_fee: { type: Number },

  has_registration_fee: { type: Boolean, default: false },
  registration_gross_fee: { type: Number, default: 0 },
  registration_concession: { type: Number, default: 0 },
  net_registration_fee: { type: Number },
  paid_registration_fee: { type: Number, default: 0 },
  balance_registration_fee: { type: Number },

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
  this.net_transport_fee =
    (this.transport_gross_fee || 0) - (this.transport_concession || 0);
  this.balance_transport_fee =
    this.net_transport_fee - (this.paid_transport_fee || 0);
  this.net_application_fee =
    (this.application_gross_fee || 0) - (this.application_concession || 0);
  this.balance_application_fee =
    this.net_application_fee - (this.paid_application_fee || 0);
  this.net_registration_fee =
    (this.registration_gross_fee || 0) - (this.registration_concession || 0);
  this.balance_registration_fee =
    this.net_registration_fee - (this.paid_registration_fee || 0);
  next();
});

withCommonFields(studentFeeReportSchema);

export default mongoose.model("StudentFeeReport", studentFeeReportSchema);
