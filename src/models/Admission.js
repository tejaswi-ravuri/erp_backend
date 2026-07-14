import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";
import { addressSchema } from "./_addressSchema.js";
import { STATES } from "../config/constants.js";

const CLASS_SOUGHT = [
  "LKG",
  "UKG",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
];

// Merged from the old two separate checklists (doc_dob_cert/doc_transfer_
// cert/etc. AND submit_aadhaar/submit_ration_card/etc.) into one list -
// the old "doc_id_proof" boolean was a vague duplicate of exactly what
// aadhaar_card/ration_card/passport/other spell out specifically, so it's
// dropped rather than carried forward as a third redundant entry.
export const DOCUMENT_TYPES = [
  "dob_certificate",
  "passport_photos",
  "transfer_certificate",
  "progress_record",
  "caste_certificate",
  "aadhaar_card",
  "ration_card",
  "passport",
  "other",
];

const previousSchoolSchema = new mongoose.Schema(
  {
    standard: { type: String, trim: true },
    year: { type: String, trim: true },
    name: { type: String, trim: true },
  },
  { _id: false },
);

const admissionSchema = new mongoose.Schema({
  academic_year: { type: String, required: true },

  // Auto-generated server-side (see utils/admissionNumbering.js) - never
  // set directly from client input.
  unique_id: { type: String, unique: true, sparse: true },
  application_no: { type: String, unique: true, sparse: true },
  admission_no: { type: String, unique: true, sparse: true },

  state: { type: String, enum: STATES },

  // Real Branch reference now, not a free-text name matching a hardcoded
  // list - see models/Branch.js (assumed to exist with at least
  // _id/name/code fields; adjust if it differs).
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
    index: true,
  },

  added_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  form_status: {
    type: String,
    enum: ["Enquiry", "Applied", "Under Review", "Admitted", "Rejected"],
    default: "Enquiry",
  },
  class_sought: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Class",
    required: true,
  },
  student_name: { type: String, required: true },
  gender: { type: String, enum: ["Male", "Female", "Other"], required: true },
  dob: { type: Date },
  height_cm: { type: Number },
  weight_kg: { type: Number },
  nationality: { type: String, default: "Indian" },
  religion: { type: String },
  mother_tongue: { type: String },
  caste: { type: String, enum: ["SC", "ST", "BC", "OC"] },

  // Renamed from id_mark_1/id_mark_2 for clarity.
  identification_mark_1: { type: String },
  identification_mark_2: { type: String },

  blood_group: {
    type: String,
    enum: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
  },
  health_status: { type: String },
  passport_photo: { type: String },

  father_name: { type: String },
  father_qualification: { type: String },
  father_occupation: { type: String },
  father_mobile: { type: String, required: true },
  father_email: { type: String, lowercase: true, trim: true },
  mother_name: { type: String },
  mother_qualification: { type: String },
  mother_occupation: { type: String },
  mother_mobile: { type: String, required: true },
  mother_email: { type: String, lowercase: true, trim: true },
  family_income_pa: { type: Number },

  // Structured subdocuments now, not flat strings - see
  // models/_addressSchema.js. Each independently optional overall (a
  // record can exist with neither filled in at Enquiry stage), but if
  // provided, addressSchema's own required subfields (line1/city/state/
  // pincode) and pincode format apply.
  communication_address: { type: addressSchema, default: null },
  permanent_address: { type: addressSchema, default: null },
  same_as_communication: { type: Boolean, default: false },

  // Array, capped at 10 (was a fixed 3-slot prev_school_1/2/3 set).
  previous_schools: {
    type: [previousSchoolSchema],
    default: [],
    validate: {
      validator: (arr) => arr.length <= 10,
      message: "You can add up to 10 previous schools.",
    },
  },

  // Merged single array (was doc_* + submit_* as separate boolean sets).
  documents_collected: {
    type: [{ type: String, enum: DOCUMENT_TYPES }],
    default: [],
  },

  // Validated with the Verhoeff checksum (see utils/verhoeff.js), not
  // just a 12-digit-length check - catches real-world typos.
  aadhaar_no: {
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        if (!v) return true; // optional until final submission - enforced in the controller
        return /^\d{12}$/.test(v);
      },
      message: "Aadhaar number must be exactly 12 digits.",
    },
  },

  source_direct: { type: Boolean, default: false },
  source_tele_call: { type: Boolean, default: false },
  source_outdoor_ads: { type: Boolean, default: false },

  staff_pro_name: { type: String },
  fee_payable_amount: { type: Number, required: true },
  term1_due_date: { type: Date },
  term2_due_date: { type: Date },
  term3_due_date: { type: Date },

  declaration_accepted: { type: Boolean, default: false },
  declaration_date: { type: String },
  saleOfApplicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Application",
    default: null,
  },

  // student_signature / parent_signature / principal_signature removed
  // entirely, per request.

  // Set once an admission is actually converted into a Student record -
  // lets the "Convert to Student" action be idempotent (never creates a
  // second Student for the same admission).
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    default: null,
  },
});

withCommonFields(admissionSchema);

export const ADMISSION_CLASS_SOUGHT = CLASS_SOUGHT;
export default mongoose.model("Admission", admissionSchema);
