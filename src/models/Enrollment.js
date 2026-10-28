import mongoose from "mongoose";
import { jsonOptions } from "./modelOptions.js";

const accessHistorySchema = new mongoose.Schema(
  {
    action: { type: String, enum: ["granted", "revoked"], required: true },
    source: { type: String, enum: ["stripe", "free", "manual", "legacy"], default: "legacy" },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    at: { type: Date, default: Date.now },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const enrollmentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    completedLessons: { type: [String], default: [] },
    accessStatus: { type: String, enum: ["active", "revoked"], default: "active", index: true },
    accessSource: { type: String, enum: ["stripe", "free", "manual", "legacy"], default: "legacy" },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    accessHistory: { type: [accessHistorySchema], default: [] },
    enrolledAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: jsonOptions, toObject: jsonOptions }
);

enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

export default mongoose.models.Enrollment || mongoose.model("Enrollment", enrollmentSchema);
