// controllers/studentController.js
import mongoose from "mongoose";
import Student from "../models/Student.js";
import StudentFeeReport from "../models/StudentFeeReport.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { isAllowed } from "../rbac/permissions.js";
import {
  buildScopeFilter,
  sanitizeAndScopeBody,
} from "../middleware/branchScope.js";
import { ROLES } from "../config/constants.js";
import Class from "../models/Class.js";

const RESERVED_QUERY_KEYS = new Set(["sort", "limit", "page", "skip"]);

function parseListQuery(query) {
  const filter = {};
  for (const [key, value] of Object.entries(query)) {
    if (RESERVED_QUERY_KEYS.has(key)) continue;
    if (typeof value === "string" && value.includes(",")) {
      filter[key] = { $in: value.split(",") };
    } else {
      filter[key] = value;
    }
  }
  const sort = query.sort || "-created_date";
  const limit = query.limit ? Math.min(parseInt(query.limit, 10), 1000) : 200;
  const page = query.page ? Math.max(parseInt(query.page, 10), 1) : 1;
  const skip = query.skip ? parseInt(query.skip, 10) : (page - 1) * limit;
  return { filter, sort, limit, skip };
}

function assertAllowed(action, role) {
  if (!isAllowed("Student", action, role)) {
    throw new ApiError(
      403,
      `Your role is not permitted to ${action} Student records.`,
    );
  }
}

// GET /api/students
export const listStudents = asyncHandler(async (req, res) => {
  console.log("hitting---student api");
  assertAllowed("read", req.user.role);
  const { filter, sort, limit, skip } = parseListQuery(req.query);
  const scope = buildScopeFilter("Student", req.user);
  const finalFilter = { ...filter, ...scope };

  // Teachers only ever see students in classes they're actually assigned to.
  if (req.user.role === ROLES.TEACHER) {
    const teacherId = new mongoose.Types.ObjectId(String(req.user._id));
    const assignedClasses = await Class.find({
      $or: [
        { class_teacher_id: teacherId },
        { "subject_teachers.teacher_id": teacherId },
      ],
    })
      .select("_id")
      .lean();
    const assigned = assignedClasses.map((c) => String(c._id));

    if (assigned.length === 0) {
      return res.json({ data: [], total: 0, page: 1, limit });
    }
    const requestedClass =
      typeof filter.class === "string" ? filter.class : null;
    finalFilter.class =
      requestedClass && assigned.includes(requestedClass)
        ? requestedClass
        : { $in: assigned };
  }

  const [data, total] = await Promise.all([
    Student.find(finalFilter).sort(sort).skip(skip).limit(limit).lean(),
    Student.countDocuments(finalFilter),
  ]);

  res.json({ data, total, page: Math.floor(skip / limit) + 1, limit });
});

// GET /api/students/:id
export const getStudentById = asyncHandler(async (req, res) => {
  assertAllowed("read", req.user.role);
  const scope = buildScopeFilter("Student", req.user);
  const doc = await Student.findOne({ _id: req.params.id, ...scope });
  if (!doc) throw new ApiError(404, "Student record not found.");
  res.json(doc);
});

// POST /api/students
export const createStudent = asyncHandler(async (req, res) => {
  assertAllowed("create", req.user.role);
  const body = sanitizeAndScopeBody("Student", req.user, req.body);
  const doc = await Student.create({
    ...body,
    created_by: req.user._id,
    updated_by: req.user._id,
    schoolName: req.user.schoolName || "Master Minds Default",
  });
  res.status(201).json(doc);
});

// POST /api/students/bulk
export const bulkCreateStudents = asyncHandler(async (req, res) => {
  assertAllowed("create", req.user.role);
  if (!Array.isArray(req.body)) {
    throw new ApiError(
      400,
      "Bulk create expects an array of records in the request body.",
    );
  }

  const docs = req.body.map((item) => ({
    ...sanitizeAndScopeBody("Student", req.user, item),
    created_by: req.user._id,
    updated_by: req.user._id,
    schoolName: req.user.schoolName || "Master Minds Default",
  }));

  try {
    const created = await Student.insertMany(docs, { ordered: false });
    return res.status(201).json({
      created: created.length,
      failed: 0,
      data: created,
      errors: [],
    });
  } catch (err) {
    const insertedDocs = err.insertedDocs || err.results?.insertedDocs || [];
    const writeErrors =
      err.writeErrors || err.result?.result?.writeErrors || [];

    if (insertedDocs.length === 0 && writeErrors.length === 0) {
      throw err;
    }

    return res.status(207).json({
      created: insertedDocs.length,
      failed: docs.length - insertedDocs.length,
      data: insertedDocs,
      errors: writeErrors.map((e) => ({
        index: e.index,
        message: e.errmsg || e.err?.errmsg || "Validation failed.",
      })),
    });
  }
});

// PUT /api/students/:id
export const updateStudent = asyncHandler(async (req, res) => {
  assertAllowed("update", req.user.role);
  const scope = buildScopeFilter("Student", req.user);
  const clean = sanitizeAndScopeBody("Student", req.user, req.body);
  delete clean.branch;

  const doc = await Student.findOneAndUpdate(
    { _id: req.params.id, ...scope },
    { ...clean, updated_by: req.user._id },
    { new: true, runValidators: true },
  );
  if (!doc) throw new ApiError(404, "Student record not found.");
  res.json(doc);
});

// POST /api/students/promote
// body: { student_ids: [...], class: <target Class _id> }
// Moves a batch of students to a higher class in a later academic year.
// Every selected student must currently be in the same class as the
// target's branch, in a strictly lower grade, and in a strictly earlier
// academic year - otherwise nothing is written (all-or-nothing). Their
// linked StudentFeeReport(s), if any, follow the class change and flip to
// student_type "Existing" since a promoted student is a continuing
// student, not a fresh admission.
export const promoteStudents = asyncHandler(async (req, res) => {
  assertAllowed("update", req.user.role);

  const { student_ids, class: newClassId } = req.body;
  if (!Array.isArray(student_ids) || student_ids.length === 0 || !newClassId) {
    throw new ApiError(
      400,
      "student_ids (a non-empty array) and class are required.",
    );
  }

  const targetClass = await Class.findOne({
    _id: newClassId,
    is_deleted: { $ne: true },
  }).lean();
  if (!targetClass) throw new ApiError(404, "Target class not found.");

  const scope = buildScopeFilter("Student", req.user);
  const students = await Student.find({
    _id: { $in: student_ids },
    ...scope,
  }).lean();
  if (students.length !== student_ids.length) {
    throw new ApiError(
      404,
      "One or more selected students were not found.",
    );
  }

  const currentClassIds = [...new Set(students.map((s) => String(s.class)))];
  const currentClasses = await Class.find({
    _id: { $in: currentClassIds },
  }).lean();
  const currentClassMap = Object.fromEntries(
    currentClasses.map((c) => [String(c._id), c]),
  );

  const errors = [];
  for (const s of students) {
    if (String(s.branch) !== String(targetClass.branch)) {
      errors.push(
        `${s.full_name}: target class belongs to a different branch.`,
      );
      continue;
    }
    const current = currentClassMap[String(s.class)];
    if (!current) {
      errors.push(`${s.full_name}: current class could not be resolved.`);
      continue;
    }
    if (targetClass.grade_order <= current.grade_order) {
      errors.push(
        `${s.full_name}: can only be promoted to a higher class than their current one.`,
      );
      continue;
    }
    if (!(targetClass.academic_year > current.academic_year)) {
      errors.push(
        `${s.full_name}: target class must be from a later academic year.`,
      );
    }
  }
  if (errors.length > 0) {
    throw new ApiError(400, errors.join(" "));
  }

  const studentIds = students.map((s) => s._id);
  await Student.updateMany(
    { _id: { $in: studentIds } },
    { class: targetClass._id, updated_by: req.user._id },
  );
  await StudentFeeReport.updateMany(
    { student_id: { $in: studentIds } },
    { class: targetClass._id, student_type: "Existing" },
  );

  res.json({
    success: true,
    promoted: studentIds.length,
    class: targetClass._id,
  });
});

// DELETE /api/students/:id
export const deleteStudent = asyncHandler(async (req, res) => {
  assertAllowed("delete", req.user.role);
  const scope = buildScopeFilter("Student", req.user);
  const doc = await Student.findOneAndUpdate(
    { _id: req.params.id, ...scope },
    { is_deleted: true, deleted_at: new Date(), updated_by: req.user._id },
    { new: true },
  );
  if (!doc) throw new ApiError(404, "Student record not found.");
  res.json({ success: true, id: doc._id });
});
