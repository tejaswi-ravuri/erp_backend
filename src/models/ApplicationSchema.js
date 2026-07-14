// Generate schema from the above JSON data
import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    studentName: { type: String, required: true },
    fatherName: { type: String, required: true },
    className: { type: String, required: true },
    academicYear: { type: String, required: true },
    mobileNo: { type: String, required: true },
    applicationNo: { type: String, required: true },
    commAddressLine1: { type: String, required: true },
    commLandmark: { type: String, required: true },
    commCity: { type: String, required: true },
    commDistrict: { type: String, required: true },
    commState: { type: String, required: true },
    permenantAddressLine1: { type: String, required: true },
    permenantLandmark: { type: String, required: true },
    permenantCity: { type: String, required: true },
    permenantDistrict: { type: String, required: true },
    permenantState: { type: String, required: true },
    proName: { type: String, required: true },
    selectMV: { type: String, required: true },
    mvNo: { type: String, required: true },
    bank: { type: String, required: true },
    previousSchool: { type: String, required: true },
    isPermanentSameAsCommunication: {
      type: Boolean,
      required: true,
      default: false,
    },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
  },
  { timestamps: true },
);

const Application = mongoose.model("Application", applicationSchema);

export default Application;
