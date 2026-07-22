import mongoose from "mongoose";
import Class from "../models/Class.js";
import Student from "../models/Student.js";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { isAllowed } from "../rbac/permissions.js";
import {
  buildScopeFilter,
  sanitizeAndScopeBody,
} from "../middleware/branchScope.js";
import { ROLES } from "../config/constants.js";

function assertAllowed(action, role) {
  if (!isAllowed("Class", action, role)) {
    throw new ApiError(
      403,
      `Your role is not permitted to ${action} Class records.`,
    );
  }
}

function friendlyDuplicateError(err) {
  if (err?.code !== 11000) return null;
  const keys = Object.keys(err.keyPattern || {});
  if (keys.includes("class_teacher_id"))
    return "This teacher is already the class teacher for another class this academic year.";
  if (
    keys.includes("branch") &&
    keys.includes("academic_year") &&
    keys.includes("grade")
  ) {
    return "A class with this grade already exists for the selected branch and academic year.";
  }
  return "A record with these values already exists.";
}

// GET /api/classes
export const listClasses = asyncHandler(async (req, res) => {
  const scope = buildScopeFilter("Class", req.user);
  const matchFilter = {
    ...scope,
    is_deleted: { $ne: true },
  };

  if (req.query.academic_year) {
    matchFilter.academic_year = req.query.academic_year;
  }

  const currentUserId = new mongoose.Types.ObjectId(String(req.user._id));

  // Teacher only sees classes assigned to them
  if (req.user.role === ROLES.TEACHER) {
    matchFilter.$or = [
      { class_teacher_id: currentUserId },
      { "subject_teachers.teacher_id": currentUserId },
    ];
  }

  const classes = await Class.aggregate([
    { $match: matchFilter },
    { $sort: { grade_order: 1 } },

    {
      $lookup: {
        from: "users",
        localField: "class_teacher_id",
        foreignField: "_id",
        as: "class_teacher",
        pipeline: [
          {
            $project: {
              full_name: 1,
              email: 1,
            },
          },
        ],
      },
    },

    {
      $unwind: {
        path: "$class_teacher",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $addFields: {
        my_subjects: {
          $map: {
            input: {
              $filter: {
                input: "$subject_teachers",
                cond: {
                  $eq: ["$$this.teacher_id", currentUserId],
                },
              },
            },
            in: "$$this.subject",
          },
        },
      },
    },
  ]);

  // Teachers list (only for admin/principal)
  let teachers = [];

  const teacherFilter = {
    role: ROLES.TEACHER,
    is_active: true,
  };

  // Branch-scoped users only see teachers from their branch
  if (req.user.role !== ROLES.SUPER_ADMIN) {
    teacherFilter.branch = req.user.branch;
  }

  teachers = await User.find(teacherFilter)
    .select("_id full_name email")
    .sort({ full_name: 1 })
    .lean();

  res.json({
    data: classes,
    teachers,
    total: classes.length,
  });
});

// POST /api/classes
export const createClass = asyncHandler(async (req, res) => {
  assertAllowed("create", req.user.role);
  const body = sanitizeAndScopeBody("Class", req.user, req.body);
  const branch = req.user.branch;
  if (!branch) {
    throw new ApiError(
      400,
      "No branch specified and your account has no default branch - please select a branch.",
    );
  }

  // Deleting a class is soft (is_deleted: true) - it keeps its
  // grade/academic_year/branch, so re-adding the same class would
  // otherwise collide with its own deleted self on the unique index and
  // read as "already exists". Resurrect that record instead of inserting
  // a duplicate. Old Class Teacher / subject-teacher assignments are
  // cleared - they may be stale, and could re-violate the "one homeroom
  // class per teacher per year" unique index if left in place.
  const deletedMatch = await Class.findOne({
    branch,
    academic_year: body.academic_year,
    grade: body.grade,
    is_deleted: true,
  });

  if (deletedMatch) {
    deletedMatch.is_deleted = false;
    deletedMatch.deleted_at = null;
    deletedMatch.capacity = body.capacity ?? null;
    deletedMatch.class_teacher_id = null;
    deletedMatch.subject_teachers = [];
    deletedMatch.updated_by = req.user._id;
    await deletedMatch.save();
    return res.status(201).json(deletedMatch);
  }

  try {
    const doc = await Class.create({
      ...body,
      branch,
      created_by: req.user._id,
      updated_by: req.user._id,
    });
    res.status(201).json(doc);
  } catch (err) {
    const friendly = friendlyDuplicateError(err);
    if (friendly) throw new ApiError(409, friendly);
    throw err;
  }
});
// PUT /api/classes/:id
export const updateClass = asyncHandler(async (req, res) => {
  assertAllowed("update", req.user.role);
  const scope = buildScopeFilter("Class", req.user);
  const clean = sanitizeAndScopeBody("Class", req.user, req.body);
  delete clean.branch;
  delete clean.subject_teachers; // managed only via the dedicated endpoints below

  try {
    const doc = await Class.findOneAndUpdate(
      { _id: req.params.id, ...scope },
      { ...clean, updated_by: req.user._id },
      { new: true, runValidators: true },
    );
    if (!doc) throw new ApiError(404, "Class record not found.");
    res.json(doc);
  } catch (err) {
    const friendly = friendlyDuplicateError(err);
    if (friendly) throw new ApiError(409, friendly);
    throw err;
  }
});

// DELETE /api/classes/:id
export const deleteClass = asyncHandler(async (req, res) => {
  assertAllowed("delete", req.user.role);
  const scope = buildScopeFilter("Class", req.user);
  const studentCount = await Student.countDocuments({
    class: req.params.id,
    is_deleted: { $ne: true },
  });
  if (studentCount > 0) {
    throw new ApiError(
      409,
      `Cannot delete — ${studentCount} student(s) are still enrolled in this class.`,
    );
  }
  const doc = await Class.findOneAndUpdate(
    { _id: req.params.id, ...scope },
    { is_deleted: true, deleted_at: new Date(), updated_by: req.user._id },
    { new: true },
  );
  if (!doc) throw new ApiError(404, "Class record not found.");
  res.json({ success: true, id: doc._id });
});

// PUT /api/classes/:id/subject-teachers  (body: { teacher_id, subject })
export const assignSubjectTeacher = asyncHandler(async (req, res) => {
  assertAllowed("update", req.user.role);
  const { teacher_id, subject } = req.body;
  if (!teacher_id || !subject)
    throw new ApiError(400, "teacher_id and subject are required.");

  const teacherDoc = await User.findOne({
    _id: teacher_id,
    role: ROLES.TEACHER,
  })
    .select("_id")
    .lean();
  if (!teacherDoc)
    throw new ApiError(
      400,
      "teacher_id must reference an active teacher account.",
    );

  const scope = buildScopeFilter("Class", req.user);
  const cls = await Class.findOne({ _id: req.params.id, ...scope });
  if (!cls) throw new ApiError(404, "Class record not found.");

  const already = cls.subject_teachers.some(
    (row) =>
      String(row.teacher_id) === String(teacher_id) && row.subject === subject,
  );
  if (already)
    throw new ApiError(
      409,
      "This teacher is already assigned to this subject for this class.",
    );

  cls.subject_teachers.push({ teacher_id, subject });
  cls.updated_by = req.user._id;
  await cls.save(); // runs the branch-guard pre-save hook
  res.json(cls);
});

// DELETE /api/classes/:id/subject-teachers  (body: { teacher_id, subject })
export const removeSubjectTeacher = asyncHandler(async (req, res) => {
  assertAllowed("update", req.user.role);
  const { teacher_id, subject } = req.body;
  if (!teacher_id || !subject)
    throw new ApiError(400, "teacher_id and subject are required.");

  const scope = buildScopeFilter("Class", req.user);
  const cls = await Class.findOne({ _id: req.params.id, ...scope });
  if (!cls) throw new ApiError(404, "Class record not found.");

  cls.subject_teachers = cls.subject_teachers.filter(
    (row) =>
      !(
        String(row.teacher_id) === String(teacher_id) && row.subject === subject
      ),
  );
  cls.updated_by = req.user._id;
  await cls.save();
  res.json(cls);
});
