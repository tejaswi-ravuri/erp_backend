// utils/teacherScope.js
//
// Class.subject_teachers is the single source of truth for "who teaches
// what, in which class" (see models/Class.js) — User no longer stores
// subject_assignments, so every scoping check here reads from Class.

import Class from "../models/Class.js";
import mongoose from "mongoose";

/**
 * Class _ids (as strings) where this user is the Class Teacher (homeroom).
 */
export async function getClassTeacherClassIds(userId, branchFilter = {}) {
  const classes = await Class.find({
    ...branchFilter,
    class_teacher_id: userId,
  }).select("_id");
  return classes.map((c) => String(c._id));
}

/**
 * Every { class_id, subject } pair this teacher is assigned to teach,
 * read from Class.subject_teachers across every class in scope.
 *
 * Fetch this ONCE per request and reuse it for every check that request
 * needs — isAssignedToClassSubject below is a pure/local lookup against
 * this array, not a fresh DB call each time.
 */
export async function getTeacherSubjectAssignments(userId, branchFilter = {}) {
  const classes = await Class.find({
    ...branchFilter,
    "subject_teachers.teacher_id": userId,
  }).select("_id subject_teachers");

  const assignments = [];
  console.log(classes);
  for (const c of classes) {
    for (const st of c.subject_teachers) {
      console.log(st.teacher_id);
      console.log("userid----------", userId);

      console.log(st.teacher_id instanceof mongoose.Types.ObjectId);
      console.log(userId instanceof mongoose.Types.ObjectId);
      if (String(st.teacher_id) === String(userId._id)) {
        assignments.push({ class_id: String(c._id), subject: st.subject });
      }
    }
  }
  console.log(assignments);
  return assignments;
}

/**
 * Local check: does `assignments` (from getTeacherSubjectAssignments)
 * contain this exact (classId, subject) pair? No DB call — pass in an
 * already-fetched assignments array.
 */
export function isAssignedToClassSubject(assignments, classId, subject) {
  console.log("----classId", classId);
  console.log(assignments, classId, subject);
  if (!classId || !subject) return false;
  return (assignments || []).some(
    (a) => String(a.class_id) === String(classId) && a.subject === subject,
  );
}

export async function getTeacherClassIds(userId, branchFilter = {}) {
  const assignments = await getTeacherSubjectAssignments(userId, branchFilter);
  return [...new Set(assignments.map((a) => a.class_id))];
}
