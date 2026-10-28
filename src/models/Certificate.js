import mongoose from "mongoose";
import { jsonOptions } from "./modelOptions.js";

const certificateSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: jsonOptions, toObject: jsonOptions }
);

certificateSchema.index({ student: 1, course: 1 }, { unique: true });

export default mongoose.models.Certificate || mongoose.model("Certificate", certificateSchema);
