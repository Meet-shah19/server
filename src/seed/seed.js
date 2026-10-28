import "../config/env.js";
import mongoose from "mongoose";
import { initialCourses } from "../../../lms- Instructor/src/data/initialCourses.js";
import connectDB from "../config/db.js";
import Category from "../models/Category.js";
import Course from "../models/Course.js";
import User from "../models/User.js";

const accounts = [
  { name: "LMS Administrator", email: "admin@lms.com", role: "admin", password: "Admin@123" },
  { name: "Demo Instructor", email: "instructor@lms.com", role: "instructor", password: "Instructor@123" },
  { name: "Demo Student", email: "student@lms.com", role: "student", password: "  " },
];
const categoryNames = ["Development", "Design", "Business", "Marketing", "Other"];

try {
  await connectDB();

  const users = {};
  for (const account of accounts) {
    let user = await User.findOne({ email: account.email });
    if (!user) user = new User();
    user.name = account.name;
    user.email = account.email;
    user.role = account.role;
    user.status = "Active";
    user.password = account.password;
    await user.save();
    users[account.role] = user;
  }

  for (const name of categoryNames) {
    await Category.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true });
  }

  for (const sample of initialCourses) {
    const status = String(sample.status || "draft").toLowerCase().replace(/\s+/g, "_");
    const normalizedStatus = ["draft", "pending_review", "changes_requested", "approved", "published", "rejected"]
      .includes(status) ? status : "draft";
    const lessons = sample.lessons || [];
    const introIndex = Math.max(0, lessons.findIndex((lesson) => lesson.isFreeIntroduction === true));
    const normalizedLessons = lessons.map((lesson, index) => ({
      ...lesson,
      isFreeIntroduction: index === introIndex,
    }));
    const course = {
      title: sample.title,
      description: sample.description,
      category: sample.category,
      level: sample.level,
      status: normalizedStatus,
      modules: sample.modules,
      lessons: normalizedLessons,
      quizzes: sample.quizzes,
      price: 0,
      hasPublishedVersion: normalizedStatus === "published",
      publishedVersion: normalizedStatus === "published" ? {
        title: sample.title,
        description: sample.description,
        category: sample.category,
        level: sample.level,
        price: 0,
        modules: sample.modules,
        lessons: normalizedLessons,
        quizzes: sample.quizzes,
      } : null,
      instructor: users.instructor._id,
    };
    await Course.updateOne(
      { title: sample.title, instructor: users.instructor._id },
      { $set: course },
      { upsert: true, runValidators: true }
    );
  }

  console.log(`Seeded ${accounts.length} accounts, ${categoryNames.length} categories, and ${initialCourses.length} courses.`);
} catch (error) {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
