import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";
import { addressSchema } from "./_addressSchema.js";

const studentSchema = new mongoose.Schema({
  admission_no: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  full_name: { type: String, required: true, trim: true },
  dob: { type: Date },
  gender: { type: String, enum: ["Male", "Female", "Other"] },
  blood_group: {
    type: String,
    enum: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
  },

  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Class",
    required: true,
    index: true,
  },

  roll_no: { type: String },
  parent_name: { type: String },
  parent_phone: {
    type: String,
    trim: true,
    validate: {
      validator: (v) => !v || /^\d{10}$/.test(v),
      message: (props) =>
        `"${props.value}" is not a valid 10-digit phone number.`,
    },
  },
  parent_email: { type: String, lowercase: true, trim: true },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
    index: true,
  },
  address: { type: addressSchema, default: null },
  joining_date: { type: Date },
  status: {
    type: String,
    enum: [
      "Active",
      "Inactive",
      "Graduated",
      "Transferred Out",
      "Dropped Out",
      "On Leave",
      "Alumni",
    ],
    default: "Active",
  },
  photo_url: { type: String },
  schoolName: {
    type: String,
    required: true,
  },
});

withCommonFields(studentSchema);
studentSchema.index({ branch: 1, class: 1 });

// Guard-rail: a student's class must belong to the student's own branch.
studentSchema.pre("save", async function (next) {
  if (!this.isModified("class")) return next();
  const cls = await mongoose
    .model("Class")
    .findById(this.class)
    .select("branch")
    .lean();
  if (!cls) return next(new Error("Assigned class does not exist."));
  if (String(cls.branch) !== String(this.branch)) {
    return next(
      new Error("Student's class must belong to the student's own branch."),
    );
  }
  next();
});

export default mongoose.model("Student", studentSchema);
