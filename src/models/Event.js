import mongoose from "mongoose";
import { withCommonFields } from "./_baseSchema.js";

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  date: { type: Date, required: true },
  end_date: { type: Date },
  venue: { type: String },
  type: { type: String, enum: ["Academic", "Cultural", "Sports", "Holiday", "Other"] },
  for_class: { type: String },
});

withCommonFields(eventSchema);

export default mongoose.model("Event", eventSchema);
