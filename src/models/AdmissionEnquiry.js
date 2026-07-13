import mongoose from "mongoose";

const admissionEnquirySchema = new mongoose.Schema(
  {
    applicationid: { type: String, required: true, unique: true },
    studentName: { type: String, required: true },
    branch: { type: String, required: true },
    mobile: { type: String, required: true },
    academicYear: { type: String, required: true },
    status: { type: String, required: true },
    date: { type: Date, required: true },
    fatherName: { type: String, required: true },
    className: { type: String, required: true },
    board: { type: String, required: true },
    emailId: { type: String, required: true },
    addressLine1: { type: String, required: true },
    landmark: { type: String, required: true },
    city: { type: String, required: true },
    district: { type: String, required: true },
    state: { type: String, required: true },
    previousSchool: { type: String, required: true },
    enquiryType: { type: String, required: true },
    proName: { type: String, required: true },
    added_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

// Export the model
export default mongoose.model("AdmissionEnquiry", admissionEnquirySchema);
