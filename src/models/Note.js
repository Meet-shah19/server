import mongoose from "mongoose";
import { jsonOptions } from "./modelOptions.js";

const noteSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    lessonId: { type: String },
    content: { type: String, required: true },
  },
  { timestamps: true, toJSON: jsonOptions, toObject: jsonOptions }
);

noteSchema.index({ student: 1, course: 1, lessonId: 1 }, { unique: true });

export default mongoose.models.Note || mongoose.model("Note", noteSchema);
