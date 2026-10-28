import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import app from "../app.js";
import Course from "../models/Course.js";
import Enrollment from "../models/Enrollment.js";
import Purchase from "../models/Purchase.js";
import User from "../models/User.js";
import { getCourse, getLesson, updateCourse } from "./course.controller.js";
import { checkoutSuccess } from "./payment.controller.js";

function makeResponse() {
  return {
    statusCode: 200,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function invoke(controller, req, res = makeResponse()) {
  let nextError;
  await controller(req, res, (error) => { nextError = error; });
  if (nextError) throw nextError;
  return res;
}

function courseQuery(course) {
  return { populate: async () => course };
}

test("instructor cannot approve their own course through the admin review route", async (context) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "access-control-test-secret";
  const instructorId = new mongoose.Types.ObjectId();
  const originalFindById = User.findById;
  User.findById = async () => ({
    _id: instructorId,
    role: "instructor",
    status: "Active",
  });
  const server = app.listen(0);
  context.after(async () => {
    User.findById = originalFindById;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    await new Promise((resolve) => server.close(resolve));
  });
  await new Promise((resolve) => server.once("listening", resolve));

  const token = jwt.sign({ sub: String(instructorId) }, process.env.JWT_SECRET);
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/admin/courses/course-id/review`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "approve" }),
    }
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "You do not have permission to perform this action.",
  });
});

test("student cannot read an unpublished course by its ID", async () => {
  const originalFindById = Course.findById;
  Course.findById = () => courseQuery({
    _id: "course-id",
    status: "pending_review",
    toJSON() {
      return { id: "course-id", status: "pending_review", lessons: [] };
    },
  });
  try {
    const response = await invoke(getCourse, {
      params: { id: "course-id" },
      user: { _id: "student-id", role: "student" },
    });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { error: "Course not found." });
  } finally {
    Course.findById = originalFindById;
  }
});

test("student cannot open locked lesson content without an active enrollment", async () => {
  const originalFindById = Course.findById;
  const originalEnrollmentExists = Enrollment.exists;
  const course = {
    _id: "course-id",
    status: "published",
    toJSON() {
      return {
        id: "course-id",
        status: "published",
        lessons: [
          { id: "intro", title: "Introduction", content: "free", isFreeIntroduction: true },
          { id: "locked", title: "Paid lesson", content: "secret", isFreeIntroduction: false },
        ],
      };
    },
  };
  Course.findById = () => courseQuery(course);
  Enrollment.exists = async () => false;
  try {
    const response = await invoke(getLesson, {
      params: { id: "course-id", lessonId: "locked" },
      user: { _id: "student-id", role: "student" },
    });
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, { error: "Enroll in this course to access this lesson." });
  } finally {
    Course.findById = originalFindById;
    Enrollment.exists = originalEnrollmentExists;
  }
});

test("instructor cannot edit another instructor's course", async () => {
  const originalFindById = Course.findById;
  const ownerId = new mongoose.Types.ObjectId();
  Course.findById = () => courseQuery({
    _id: "course-id",
    instructor: ownerId,
    status: "draft",
    toJSON() { return { id: "course-id" }; },
  });
  try {
    const response = await invoke(updateCourse, {
      params: { id: "course-id" },
      body: { title: "Changed title" },
      user: { _id: new mongoose.Types.ObjectId(), role: "instructor" },
    });
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, { error: "You can only edit your own courses." });
  } finally {
    Course.findById = originalFindById;
  }
});

test("admin edits to a published course update the live snapshot without review", async () => {
  const originalFindById = Course.findById;
  const course = {
    _id: new mongoose.Types.ObjectId(),
    title: "Original title",
    description: "Course description",
    category: "Technology",
    level: "Beginner",
    price: 100,
    modules: [],
    lessons: [],
    quizzes: [],
    instructor: new mongoose.Types.ObjectId(),
    status: "published",
    hasPublishedVersion: true,
    publishedVersion: { title: "Original title" },
    reviewHistory: [],
    toObject() {
      return {
        title: this.title,
        description: this.description,
        category: this.category,
        level: this.level,
        price: this.price,
        modules: this.modules,
        lessons: this.lessons,
        quizzes: this.quizzes,
      };
    },
    toJSON() {
      return {
        id: String(this._id),
        title: this.title,
        status: this.status,
        instructor: this.instructor,
        lessons: this.lessons,
        quizzes: this.quizzes,
      };
    },
    async save() { this.saved = true; },
    async populate() { return this; },
  };
  Course.findById = () => courseQuery(course);
  try {
    const response = await invoke(updateCourse, {
      params: { id: String(course._id) },
      body: { title: "Admin correction" },
      user: { _id: new mongoose.Types.ObjectId(), role: "admin" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(course.saved, true);
    assert.equal(course.status, "published");
    assert.equal(course.publishedVersion.title, "Admin correction");
  } finally {
    Course.findById = originalFindById;
  }
});

test("checkout redirect alone does not grant access before the verified payment webhook", async () => {
  const originals = {
    purchaseFindOne: Purchase.findOne,
    courseFindById: Course.findById,
    enrollmentExists: Enrollment.exists,
  };
  const studentId = new mongoose.Types.ObjectId();
  const courseId = new mongoose.Types.ObjectId();
  Purchase.findOne = async () => ({
    _id: new mongoose.Types.ObjectId(),
    student: studentId,
    course: courseId,
    checkoutSessionId: "cs_pending",
    status: "pending",
    amount: 1200,
    currency: "inr",
    courseTitle: "Secure Course",
  });
  Course.findById = () => ({
    select: async () => ({ title: "Secure Course" }),
  });
  Enrollment.exists = async () => false;
  try {
    const response = await invoke(checkoutSuccess, {
      query: { session_id: "cs_pending" },
      user: { _id: studentId, role: "student" },
    });
    assert.equal(response.statusCode, 202);
    assert.equal(response.body.purchase.status, "pending");
    assert.equal(response.body.enrollmentConfirmed, false);
  } finally {
    Purchase.findOne = originals.purchaseFindOne;
    Course.findById = originals.courseFindById;
    Enrollment.exists = originals.enrollmentExists;
  }
});
