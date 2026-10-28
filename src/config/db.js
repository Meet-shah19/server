import mongoose from "mongoose";
import Enrollment from "../models/Enrollment.js";

export default async function connectDB() {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/lms";
  await mongoose.connect(mongoUri);
  await Enrollment.updateMany(
    { accessStatus: { $exists: false } },
    { $set: { accessStatus: "active" } }
  );
  console.log("Connected to MongoDB");
}
