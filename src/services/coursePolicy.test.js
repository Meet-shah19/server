import test from "node:test";
import assert from "node:assert/strict";
import Course from "../models/Course.js";
import {
  isStudentVisible,
  makePublishedVersion,
  normalizeInrPrice,
  studentVisibleCourseData,
  validateCourseForReview,
} from "./coursePolicy.js";

const validCourse = () => ({
  title: "Course",
  description: "Description",
  lessons: [
    { id: "intro", title: "Introduction", content: "Preview", isFreeIntroduction: true },
    { id: "lesson-2", title: "Lesson 2", content: "Protected", isFreeIntroduction: false },
  ],
  quizzes: [],
});

test("INR course price accepts whole rupees and rejects invalid amounts", () => {
  assert.equal(normalizeInrPrice(0), 0);
  assert.equal(normalizeInrPrice("125"), 125);
  for (const price of [-1, 2.5, "not a price", null]) {
    assert.throws(() => normalizeInrPrice(price), { status: 400 });
  }
});

test("course submission requires exactly one free introduction lesson", () => {
  const course = validCourse();
  assert.equal(validateCourseForReview(course), null);
  course.lessons[1].isFreeIntroduction = true;
  assert.match(validateCourseForReview(course), /exactly one free introduction/);
  course.lessons = [];
  assert.match(validateCourseForReview(course), /at least one lesson/);
});

test("course schema accepts only lifecycle values and enforces one intro on populated courses", () => {
  const invalidStatus = new Course({ title: "Course", status: "published_by_client" });
  assert.ok(invalidStatus.validateSync().errors.status);

  const invalidLessons = new Course({
    title: "Course",
    status: "draft",
    lessons: [
      { title: "Intro A", content: "A", isFreeIntroduction: true },
      { title: "Intro B", content: "B", isFreeIntroduction: true },
    ],
  });
  assert.ok(invalidLessons.validateSync().errors.lessons);
});

test("only published or previously published non-draft versions are student-visible", () => {
  assert.equal(isStudentVisible({ status: "published", hasPublishedVersion: false }), true);
  assert.equal(isStudentVisible({ status: "Published", hasPublishedVersion: false }), true);
  assert.equal(isStudentVisible({
    status: "pending_review",
    hasPublishedVersion: true,
    publishedVersion: { title: "Published" },
  }), true);
  assert.equal(isStudentVisible({ status: "pending_review", hasPublishedVersion: true }), false);
  assert.equal(isStudentVisible({ status: "pending_review", hasPublishedVersion: false }), false);
  assert.equal(isStudentVisible({ status: "draft", hasPublishedVersion: true }), false);
});

test("student data uses the retained published snapshot during review", () => {
  const course = {
    status: "pending_review",
    title: "Instructor's new draft",
    publishedVersion: { title: "Last published title", lessons: [{ id: "old" }] },
    toJSON() {
      return { title: this.title, lessons: [] };
    },
  };
  const result = studentVisibleCourseData(course);
  assert.equal(result.title, "Last published title");
  assert.deepEqual(result.lessons, [{ id: "old" }]);
});

test("a capitalized published course uses its current details instead of an old snapshot", () => {
  const course = {
    status: "Published",
    title: "Current published title",
    publishedVersion: { title: "Stale snapshot title" },
    toJSON() {
      return { title: this.title, status: this.status };
    },
  };

  assert.equal(studentVisibleCourseData(course).title, "Current published title");
});

test("published course snapshots retain thumbnail and lesson module assignments", () => {
  const snapshot = makePublishedVersion({
    title: "Course",
    description: "Description",
    thumbnail: "https://example.com/course.jpg",
    category: "Development",
    level: "Beginner",
    price: 0,
    modules: ["Basics"],
    lessons: [{ id: "lesson-1", module: "Basics", content: "Lesson text" }],
    quizzes: [],
  });

  assert.equal(snapshot.thumbnail, "https://example.com/course.jpg");
  assert.equal(snapshot.lessons[0].module, "Basics");
});
