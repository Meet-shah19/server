import mongoose from "mongoose";
import { jsonOptions } from "./modelOptions.js";

const purchaseSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    courseTitle: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["inr"], default: "inr" },
    status: { type: String, enum: ["free", "pending", "paid", "failed", "refunded"], default: "pending", index: true },
    provider: { type: String, enum: ["free", "stripe"], required: true },
    checkoutSessionId: { type: String, unique: true, sparse: true },
    paymentIntentId: { type: String, default: null },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: jsonOptions, toObject: jsonOptions }
);

purchaseSchema.index({ student:  1, course: 1, status: 1 });

export default mongoose.models.Purchase || mongoose.model("Purchase", purchaseSchema);
