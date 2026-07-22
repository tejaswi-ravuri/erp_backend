// controllers/marksController.js
//
// Role-aware marks endpoints. Marks.subject is a strict enum and
// Marks.class/teacher_id/branch are real references (see models/Marks.js).
//
// A "teacher" role can READ:
//   - Every subject's marks for classes where they are the Class Teacher
//     (read-only overall view - never lets them edit another teacher's
//     subject).
//   - Their own subject's marks for any class they're assigned to teach,
//     per Class.subject_teachers (the single source of truth - see
//     utils/teacherScope.js).
// A "teacher" role can WRITE (create/update) only a (class, subject) pair
// that's in their own Class.subject_teachers assignments - Class Teacher
// status never widens write access, same rule as attendance.
//
// NOTE on branch: there's no confirmed shared branch-scoping utility yet
// (buildScopeFilter's actual location is still unresolved), so this uses
// req.user.branch directly - correct for single-branch roles (teacher,
// principal, admin_officer). If a multi-branch role (super_admin,
// accounts_manager) ever needs to create/query Marks across branches,
// this will need to accept an explicit branch instead of assuming one.
//
// NOTE: `class` is a reserved word in JS, so it's destructured with an
// alias (`class: classId`) everywhere below - the actual query param /
// body key and the Mongoose field are both still literally `class`.

import Marks from "../models/Marks.js";
import {
  getClassTeacherClassIds,
  getTeacherSubjectAssignments,
  isAssignedToClassSubject,
} from "../utils/teacherScope.js";

// GET /api/marks
// Query params (all optional): class, exam_type, subject, student_id, sort, limit
export const list = async (req, res) => {
  try {
    const {
      class: classId,
      exam_type,
      subject,
      student_id,
      sort,
      limit,
    } = req.query;
    const branchFilter = { branch: req.user.branch };

    const filter = { ...branchFilter };
    if (exam_type) filter.exam_type = exam_type;
    if (student_id) filter.student_id = student_id;

    if (req.user.role === "teacher") {
      const classTeacherClassIds = await getClassTeacherClassIds(req.user);
      const myAssignments = await getTeacherSubjectAssignments(req.user);

      if (classId && subject) {
        // Explicit single class+subject request: must be their own
        // assignment, or a class they are Class Teacher of (read-only).
        const owns = isAssignedToClassSubject(myAssignments, classId, subject);
        const isClassTeacher = classTeacherClassIds.includes(String(classId));
        if (!owns && !isClassTeacher) {
          return res.status(403).json({
            success: false,
            message: "You cannot view marks for this class/subject.",
          });
        }
        filter.class = classId;
        filter.subject = subject;
      } else {
        // Broader query (e.g. the class overview grid): build an $or
        // across every combo this teacher is allowed to see.
        filter.$or = [
          { class: { $in: classTeacherClassIds } }, // all subjects, own Class Teacher classes
          ...myAssignments.map((a) => ({
            class: a.class_id,
            subject: a.subject,
          })), // own subject elsewhere
        ];
        if (classId) filter.class = classId; // narrow further if a specific class was requested
        if (subject) filter.subject = subject;
      }
    } else {
      if (classId) filter.class = classId;
      if (subject) filter.subject = subject;
    }

    let query = Marks.find(filter);
    if (sort) query = query.sort(sort);
    if (limit) query = query.limit(Number(limit));

    const records = await query.lean();
    return res.json({ success: true, data: records });
  } catch (err) {
    console.error("marks.list error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch marks." });
  }
};

// POST /api/marks
export const create = async (req, res) => {
  try {
    // Only Teachers enter marks - Principal has read-only access to this
    // page (class-wide overview / Class Teacher view), never entry.
    if (req.user.role !== "teacher") {
      return res.status(403).json({
        success: false,
        message: "Only Teachers can enter marks.",
      });
    }

    const { class: classId, subject } = req.body;

    const myAssignments = await getTeacherSubjectAssignments(req.user);
    if (!isAssignedToClassSubject(myAssignments, classId, subject)) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to teach this class/subject.",
      });
    }

    const record = await Marks.create({
      ...req.body,
      class: classId,
      branch: req.user.branch,
      teacher_id: req.user.id,
    });
    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    console.error("marks.create error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create marks record." });
  }
};

// PUT /api/marks/:id
export const update = async (req, res) => {
  try {
    const existing = await Marks.findOne({
      _id: req.params.id,
      branch: req.user.branch,
    });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Marks record not found." });
    }

    if (req.user.role === "teacher") {
      const myAssignments = await getTeacherSubjectAssignments(req.user);
      if (
        !isAssignedToClassSubject(
          myAssignments,
          existing.class,
          existing.subject,
        )
      ) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to teach this class/subject.",
        });
      }
    }

    Object.assign(existing, req.body, { teacher_id: req.user.id });
    await existing.save();
    return res.json({ success: true, data: existing });
  } catch (err) {
    console.error("marks.update error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update marks record." });
  }
};
