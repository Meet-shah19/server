import mongoose from "mongoose";
import { jsonOptions } from "./modelOptions.js";

const categorySchema = new mongoose.Schema(
  { name: { type: String, required: true, unique: true, trim: true } },
  { timestamps: true, toJSON: jsonOptions, toObject: jsonOptions }
);

export default mongoose.models.Category || mongoose.model("Category", categorySchema);
