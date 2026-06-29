import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {
  ALL_ROLES,
  BRANCHES,
  ROLES,
  CROSS_BRANCH_ROLES,
} from "../config/constants.js";

const userSchema = new mongoose.Schema(
  {
    full_name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ALL_ROLES,
      required: true,
    },
    // Branch is required for branch-scoped roles (principal, admin_officer, teacher, student).
    // Cross-branch roles (accounts_manager, super_admin) may leave this null = sees all branches.
    branch: {
      type: String,
      enum: BRANCHES,
      required: function () {
        return !CROSS_BRANCH_ROLES.includes(this.role);
      },
      default: null,
    },
    phone: { type: String, trim: true },
    // Links a login account to its underlying record, so e.g. a Teacher's
    // own Staff document or a Student's own Student document can be resolved server-side.
    linked_staff_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
    },
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
