import Homework from "../models/Homework.js";
import Student from "../models/Student.js";
import Class from "../models/Class.js";
import HomeworkNotification from "../models/HomeworkNotification.js";
import {
  getTeacherClassIds,
  getTeacherSubjectAssignments,
  isAssignedToClassSubject,
} from "../utils/teacherScope.js";

// GET /api/homework
// Query params (all optional): class_id, status, sort, limit
export const list = async (req, res) => {
  try {
    const { class_id, status, sort, limit } = req.query;
    const branchFilter = req.branchFilter || {}; // TODO: wire to your branch-scoping helper

    const filter = { ...branchFilter };
    if (status) filter.status = status;

    if (req.user.role === "teacher") {
      const teacherClassIds = await getTeacherClassIds(
        req.user.id,
        branchFilter,
      );

      if (class_id && !teacherClassIds.includes(String(class_id))) {
        return res.status(403).json({
          success: false,
          message: "You can only view homework for classes you teach.",
        });
      }

      if (teacherClassIds.length === 0) {
        return res.json({ success: true, data: [] });
      }

      filter.class = class_id || { $in: teacherClassIds };
    } else if (class_id) {
      filter.class = class_id;
    }

    let query = Homework.find(filter)
      .populate("class", "grade")
      .populate("assigned_by", "full_name");

    if (sort) query = query.sort(sort);
    if (limit) query = query.limit(Number(limit));

    const records = await query.lean();
    return res.json({ success: true, data: records });
  } catch (err) {
    console.error("homework.list error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch homework." });
  }
};

// POST /api/homework
export const create = async (req, res) => {
  try {
    const { class: classId, subject } = req.body;
    const branchFilter = req.branchFilter || {};

    if (req.user.role === "teacher") {
      const assignments = await getTeacherSubjectAssignments(
        req.user.id,
        branchFilter,
      );

      if (!isAssignedToClassSubject(assignments, classId, subject)) {
        return res.status(403).json({
          success: false,
          message:
            "You can only assign homework for a class/subject you teach.",
        });
      }
    }

    // Fetch the class to get its branch
    const classDoc = await Class.findById(classId).select("branch");

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: "Class not found.",
      });
    }

    const record = await Homework.create({
      ...req.body,
      class: classId,
      branch: classDoc.branch,
      assigned_by: req.user.id,
    });

    const populated = await record.populate([
      { path: "class", select: "class section" },
      { path: "branch", select: "name" },
      { path: "assigned_by", select: "full_name" },
    ]);

    return res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (err) {
    console.error("homework.create error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create homework.",
    });
  }
};

// DELETE /api/homework/:id
export const remove = async (req, res) => {
  try {
    const branchFilter = req.branchFilter || {};
    const existing = await Homework.findOne({
      _id: req.params.id,
      ...branchFilter,
    });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Homework not found." });
    }

    if (req.user.role === "teacher") {
      const assignments = await getTeacherSubjectAssignments(
        req.user.id,
        branchFilter,
      );
      if (
        !isAssignedToClassSubject(assignments, existing.class, existing.subject)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You can only delete homework for a class/subject you teach.",
        });
      }
    }

    await existing.deleteOne();
    // Clean up any notifications tied to this homework so students don't
    // keep a dangling reference to a deleted assignment.
    await HomeworkNotification.deleteMany({ homework_id: existing._id });

    return res.json({ success: true, data: { _id: existing._id } });
  } catch (err) {
    console.error("homework.remove error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete homework." });
  }
};

// POST /api/homework/:id/notify
// Creates a notification for every active student in the homework's
// class, in one server-side batch instead of one create call per student
// from the client.
export const notify = async (req, res) => {
  try {
    const branchFilter = req.branchFilter || {};
    const hw = await Homework.findOne({ _id: req.params.id, ...branchFilter });
    if (!hw) {
      return res
        .status(404)
        .json({ success: false, message: "Homework not found." });
    }

    if (req.user.role === "teacher") {
      const assignments = await getTeacherSubjectAssignments(
        req.user.id,
        branchFilter,
      );
      if (!isAssignedToClassSubject(assignments, hw.class, hw.subject)) {
        return res.status(403).json({
          success: false,
          message:
            "You can only notify students for a class/subject you teach.",
        });
      }
    }

    // NOTE: assumes Student has a `class_id` ref field (same convention
    // used by attendance/marks elsewhere in this codebase).
    const classStudents = await Student.find({
      ...branchFilter,
      class_id: hw.class,
      status: "Active",
    }).select("_id full_name");

    if (classStudents.length === 0) {
      return res.json({ success: true, data: { notified: 0 } });
    }

    const notifications = classStudents.map((s) => ({
      ...branchFilter,
      homework_id: hw._id,
      title: hw.title,
      subject: hw.subject,
      description: hw.description,
      class: hw.class,
      due_date: hw.due_date,
      assigned_by: hw.assigned_by,
      student_id: s._id,
      student_name: s.full_name,
      status: "Unread",
    }));

    await HomeworkNotification.insertMany(notifications);

    return res.json({
      success: true,
      data: { notified: notifications.length },
    });
  } catch (err) {
    console.error("homework.notify error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to notify students." });
  }
};
