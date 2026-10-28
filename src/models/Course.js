import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { jsonOptions } from "./modelOptions.js";

const lessonSchema = new mongoose.Schema(
  {
    id: { type: String, default: randomUUID },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["video", "pdf", "text"], default: "video" },
    content: { type: String, required: true },
    module: { type: String, default: "" },
    isFreeIntroduction: { type: Boolean, default: false },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    id: { type: String, default: randomUUID },
    question: { type: String, required: true },
    options: { type: [String], default: [] },
    correctAnswer: { type: Number, required: true },
  },
  { _id: false }
);

const quizSchema = new mongoose.Schema(
  {
    id: { type: String, default: randomUUID },
    title: { type: String, required: true },
    courseId: { type: String },
    timeLimitMinutes: { type: Number, min: 1, max: 180, default: 10 },
    questions: { type: [questionSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const reviewEntrySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["submitted", "resubmitted", "approved", "changes_requested", "rejected", "published", "unpublished"],
      required: true,
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    at: { type: Date, default: Date.now },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    thumbnail: { type: String, default: "" },
    category: { type: String, default: "Uncategorized" },
    level: { type: String, default: "Beginner" },
    price: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ["draft", "pending_review", "changes_requested", "approved", "published", "rejected"],
      default: "draft",
      index: true,
    },
    modules: { type: [String], default: [] },
    lessons: {
      type: [lessonSchema],
      default: [],
      validate: {
        validator: (lessons) => lessons.length === 0 ||
          lessons.filter((lesson) => lesson.isFreeIntroduction === true).length === 1,
        message: "A course must have exactly one free introduction lesson.",
      },
    },
    quizzes: { type: [quizSchema], default: [] },
    publishedVersion: { type: mongoose.Schema.Types.Mixed, default: null },
    hasPublishedVersion: { type: Boolean, default: false },
    reviewFeedback: { type: String, default: "" },
    reviewHistory: { type: [reviewEntrySchema], default: [] },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, toJSON: jsonOptions, toObject: jsonOptions }
);

export default mongoose.models.Course || mongoose.model("Course", courseSchema);
