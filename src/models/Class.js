import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const GRADES = [
  "NURSERY",
  "LKG",
  "UKG",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
];

const classSchema = new mongoose.Schema({
  grade: {
    type: String,
    required: true,
    enum: GRADES,
    trim: true,
    index: true,
  },
  grade_order: { type: Number, required: true },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
    index: true,
  },
  academic_year: { type: String, required: true, trim: true, index: true },
  class_teacher_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    index: true,
  },
  capacity: { type: Number, default: null },

  // Replaces User.subject_assignments as the single source of truth for
  // "who teaches what in this class" — this is where that fact belongs,
  // and it turns "which classes does this teacher have" into a plain
  // query against Class instead of a reverse scan across every User.
  subject_teachers: {
    type: [
      {
        _id: false,
        teacher_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        subject: { type: String, required: true, trim: true },
      },
    ],
    default: [],
  },
});

withCommonFields(classSchema);

classSchema.pre("validate", function (next) {
  this.grade_order = GRADES.indexOf(this.grade);
  next();
});

// Only enforced among non-deleted classes - otherwise a soft-deleted class
// permanently blocks re-adding the same grade/year/branch combination,
// since deleteClass() never clears these fields, just flips is_deleted.
classSchema.index(
  { branch: 1, academic_year: 1, grade: 1 },
  { unique: true, partialFilterExpression: { is_deleted: false } },
);

classSchema.index(
  { academic_year: 1, class_teacher_id: 1 },
  {
    unique: true,
    partialFilterExpression: { class_teacher_id: { $type: "objectId" } },
  },
);

// Guard-rail: every teacher referenced here — the homeroom class_teacher_id
// or any subject_teachers entry — must belong to this class's own branch.
classSchema.pre("save", async function (next) {
  const touchedTeacher = this.isModified("class_teacher_id");
  const touchedSubjects = this.isModified("subject_teachers");
  if (!touchedTeacher && !touchedSubjects) return next();

  const ids = new Set();
  if (touchedTeacher && this.class_teacher_id)
    ids.add(String(this.class_teacher_id));
  if (touchedSubjects)
    this.subject_teachers.forEach((row) => ids.add(String(row.teacher_id)));
  if (ids.size === 0) return next();

  const count = await mongoose
    .model("User")
    .countDocuments({ _id: { $in: [...ids] }, branch: this.branch });
  if (count !== ids.size) {
    return next(
      new Error("All assigned teachers must belong to this class's branch."),
    );
  }
  next();
});

export const CLASS_GRADES = GRADES;
export default mongoose.model("Class", classSchema);
