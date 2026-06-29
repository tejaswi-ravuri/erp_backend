import Admission from "./Admission.js";
import Student from "./Student.js";
import Staff from "./Staff.js";
import Attendance from "./Attendance.js";
import Marks from "./Marks.js";
import Exam from "./Exam.js";
import ExamSchedule from "./ExamSchedule.js";
import Homework from "./Homework.js";
import HomeworkNotification from "./HomeworkNotification.js";
import FeePayment from "./FeePayment.js";
import StudentFeeReport from "./StudentFeeReport.js";
import Income from "./Income.js";
import Expenditure from "./Expenditure.js";
import Event from "./Event.js";
import Appointment from "./Appointment.js";

// Keys MUST match ENTITY_NAMES in config/constants.js and the :entityName
// path segment the frontend calls, e.g. /api/entities/Student
export const MODEL_REGISTRY = {
  Admission,
  Student,
  Staff,
  Attendance,
  Marks,
  Exam,
  ExamSchedule,
  Homework,
  HomeworkNotification,
  FeePayment,
  StudentFeeReport,
  Income,
  Expenditure,
  Event,
  Appointment,
};

export function getModel(entityName) {
  return MODEL_REGISTRY[entityName] || null;
}
