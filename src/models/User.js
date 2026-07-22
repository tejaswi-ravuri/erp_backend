import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {
  ALL_ROLES,
  ROLES,
  SINGLE_BRANCH_ROLES,
  MULTI_BRANCH_ROLES,
} from "../config/constants.js";
import { addressSchema } from "./_addressSchema.js";

const userSchema = new mongoose.Schema(
  {
    full_name: { type: String, required: true, trim: true },

    // Required for everyone except students - students log in with unique_id instead.
    email: {
      type: String,
      required: function () {
        return this.role !== ROLES.STUDENT;
      },
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },

    unique_id: {
      type: String,
      required: function () {
        return this.role === ROLES.STUDENT;
      },
      unique: true,
      sparse: true,
      trim: true,
    },

    password: { type: String, required: true, select: false },

    role: {
      type: String,
      enum: ALL_ROLES,
      required: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: function () {
        return SINGLE_BRANCH_ROLES.includes(this.role);
      },
      default: null,
    },
    branches: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Branch" }],
      default: undefined,
      validate: {
        validator: function (arr) {
          if (!MULTI_BRANCH_ROLES.includes(this.role)) return true;
          return Array.isArray(arr) && arr.length > 0;
        },
        message: "Assign at least one branch for this role.",
      },
    },

    phone: {
      type: String,
      trim: true,
      validate: {
        validator: (v) => !v || /^\d{10}$/.test(v),
        message: (props) =>
          `"${props.value}" is not a valid 10-digit phone number.`,
      },
    },
    address: { type: addressSchema, default: null },
    schoolName: {
      type: String,
      required: true,
    },

    // Staff-profile fields - live directly on User since there's no separate Staff collection.
    subject_taught: { type: [String], default: [] }, // teacher only
    qualification: { type: String, trim: true },
    joining_date: { type: Date },
    salary: { type: Number },

    // Student is still its own collection (academic record) - the login still needs
    // a pointer to it. linked_staff_id is gone - the User doc IS the staff record now.
    linked_student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },

    is_active: { type: Boolean, default: true },
    last_login_at: { type: Date, default: null },
    refresh_token_version: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_date", updatedAt: "updated_date" } },
);

userSchema.pre("save", async function (next) {
  if (
    this.role === ROLES.TEACHER &&
    this.isModified("classes_assigned") &&
    this.classes_assigned?.length
  ) {
    const count = await mongoose.model("Class").countDocuments({
      _id: { $in: this.classes_assigned },
      branch: this.branch,
    });
    if (count !== this.classes_assigned.length) {
      return next(
        new Error("All assigned classes must belong to the teacher's branch."),
      );
    }
  }
  next();
});
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refresh_token_version;
  return obj;
};

export default mongoose.model("User", userSchema);
