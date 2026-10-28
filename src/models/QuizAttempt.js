import mongoose from "mongoose";
import { jsonOptions } from "./modelOptions.js";

const quizAttemptSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    quizId: { type: String, required: true },
    answers: { type: [mongoose.Schema.Types.Mixed], default: [] },
    score: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: jsonOptions, toObject: jsonOptions }
);

export default mongoose.models.QuizAttempt || mongoose.model("QuizAttempt", quizAttemptSchema);
