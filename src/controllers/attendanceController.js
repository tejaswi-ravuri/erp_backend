import Attendance from "../models/Attendance.js";
import { buildScopeFilter } from "../middleware/branchScope.js";
import { ROLES } from "../config/constants.js";
import {
  getClassTeacherClassIds,
  getTeacherSubjectAssignments,
  isAssignedToClassSubject,
} from "../utils/teacherScope.js";

// GET /api/attendance
export const list = async (req, res) => {
  try {
    const { date, subject, class: classId, sort, limit } = req.query;
    const branchFilter = buildScopeFilter("Attendance", req.user);

    const filter = { ...branchFilter };
    if (date) filter.date = date;
    if (classId) filter.class = classId;
    if (subject) filter.subject = subject;

    if (req.user.role === ROLES.TEACHER) {
      if (classId && subject) {
        // Daily marking view: exact (class, subject) must be their own.
        const assignments = await getTeacherSubjectAssignments(req.user);
        if (!isAssignedToClassSubject(assignments, classId, subject)) {
          return res.status(403).json({
            success: false,
            message: "You are not assigned to teach this class/subject.",
          });
        }
      } else {
        // Monthly / analytics view with no subject filter: only classes
        // where this teacher is the Class Teacher (whole-class overview).
        const classTeacherClassIds = await getClassTeacherClassIds(req.user);

        if (classId && !classTeacherClassIds.includes(String(classId))) {
          return res.status(403).json({
            success: false,
            message:
              "You can only view overall attendance for classes you are Class Teacher of.",
          });
        }

        if (classTeacherClassIds.length === 0) {
          return res.json({ success: true, data: [] });
        }

        filter.class = classId || { $in: classTeacherClassIds };
      }
    }

    let query = Attendance.find(filter);
    if (sort) query = query.sort(sort);
    if (limit) query = query.limit(Number(limit));

    const records = await query.lean();
    return res.json({ success: true, data: records });
  } catch (err) {
    console.error("attendance.list error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch attendance." });
  }
};

// POST /api/attendance/bulk-mark
export const bulkMark = async (req, res) => {
  try {
    const { class_id, subject, date, records } = req.body;

    if (!class_id || !subject || !date || !Array.isArray(records)) {
      return res.status(400).json({
        success: false,
        message: "class, subject, date and records[] are required.",
      });
    }

    const branchFilter = buildScopeFilter("Attendance", req.user);
    const classId = class_id;
    if (req.user.role === ROLES.TEACHER) {
      const assignments = await getTeacherSubjectAssignments(req.user);
      if (!isAssignedToClassSubject(assignments, classId, subject)) {
        console.log("You are not assigned to teach this class/subject.");
        return res.status(403).json({
          success: false,
          message: "You are not assigned to teach this class/subject.",
        });
      }
    }

    const ops = records.map((r) => ({
      updateOne: {
        filter: {
          class: classId,
          subject,
          date,
          student_id: r.student_id,
        },
        update: {
          $set: {
            student_id: r.student_id,
            student_name: r.student_name,
            class: classId,
            subject,
            date,
            status: r.status || "Present",
            marked_by: req.user.id,
          },
        },
        upsert: true,
      },
    }));

    if (ops.length > 0) {
      await Attendance.bulkWrite(ops);
    }

    const updated = await Attendance.find({
      ...branchFilter,
      class: classId,
      subject,
      date,
    }).lean();
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error("attendance.bulkMark error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to save attendance." });
  }
};

// POST /api/attendance - single-record create, kept for other callers
export const create = async (req, res) => {
  try {
    const { class: classId, subject } = req.body;
    const branchFilter = buildScopeFilter("Attendance", req.user);

    if (req.user.role === ROLES.TEACHER) {
      const assignments = await getTeacherSubjectAssignments(req.user);
      if (!isAssignedToClassSubject(assignments, classId, subject)) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to teach this class/subject.",
        });
      }
    }

    const record = await Attendance.create({
      ...req.body,
      class: classId,
      ...branchFilter,
      marked_by: req.user.id,
    });
    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    console.error("attendance.create error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create attendance record." });
  }
};

// PUT /api/attendance/:id
export const update = async (req, res) => {
  try {
    const branchFilter = buildScopeFilter("Attendance", req.user);
    const existing = await Attendance.findOne({
      _id: req.params.id,
      ...branchFilter,
    });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Attendance record not found." });
    }

    if (req.user.role === ROLES.TEACHER) {
      const assignments = await getTeacherSubjectAssignments(req.user);
      if (
        !isAssignedToClassSubject(assignments, existing.class, existing.subject)
      ) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to teach this class/subject.",
        });
      }
    }

    Object.assign(existing, req.body, { marked_by: req.user.id });
    await existing.save();
    return res.json({ success: true, data: existing });
  } catch (err) {
    console.error("attendance.update error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update attendance record." });
  }
};
