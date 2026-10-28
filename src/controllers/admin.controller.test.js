import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { grantAccess } from "./admin.controller.js";
import Course from "../models/Course.js";
import Enrollment from "../models/Enrollment.js";
import Purchase from "../models/Purchase.js";
import User from "../models/User.js";

async function callGrant({ student, course, existing = null }) {
  const originals = {
    userFindOne: User.findOne,
    courseFindById: Course.findById,
    enrollmentFindOne: Enrollment.findOne,
    enrollmentCreate: Enrollment.create,
    purchaseCreate: Purchase.create,
  };
  let purchaseCreated = false;
  let createdData;
  let userQuery;
  User.findOne = async (query) => {
    userQuery = query;
    return student;
  };
  Course.findById = async () => course;
  Enrollment.findOne = async () => existing;
  Enrollment.create = async (data) => {
    createdData = data;
    return {
      ...data,
      _id: new mongoose.Types.ObjectId(),
      populated: false,
      async populate() {
        this.populated = true;
        return this;
      },
    };
  };
  Purchase.create = async () => {
    purchaseCreated = true;
    throw new Error("Manual access must not create a purchase.");
  };

  const response = {
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
  let nextError;
  try {
    await grantAccess(
      {
        body: { studentId: String(student._id), courseId: String(course._id) },
        user: { _id: new mongoose.Types.ObjectId(), role: "admin" },
      },
      response,
      (error) => { nextError = error; }
    );
  } finally {
    User.findOne = originals.userFindOne;
    Course.findById = originals.courseFindById;
    Enrollment.findOne = originals.enrollmentFindOne;
    Enrollment.create = originals.enrollmentCreate;
    Purchase.create = originals.purchaseCreate;
  }
  if (nextError) throw nextError;
  return { response, createdData, purchaseCreated, userQuery };
}

test("admin grant creates an active auditable manual enrollment without a purchase", async () => {
  const student = { _id: new mongoose.Types.ObjectId(), role: "student" };
  const course = { _id: new mongoose.Types.ObjectId(), status: "published" };
  const { response, createdData, purchaseCreated, userQuery } = await callGrant({ student, course });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.accessStatus, "active");
  assert.equal(response.body.accessSource, "manual");
  assert.ok(response.body.grantedBy);
  assert.deepEqual(createdData.accessHistory.map(({ action, source }) => ({ action, source })), [
    { action: "granted", source: "manual" },
  ]);
  assert.equal(purchaseCreated, false);
  assert.equal(userQuery.role, "student");
});

test("admin grant reactivates revoked access and appends an audit entry", async () => {
  const student = { _id: new mongoose.Types.ObjectId(), role: "student" };
  const course = { _id: new mongoose.Types.ObjectId(), status: "published" };
  const existing = {
    _id: new mongoose.Types.ObjectId(),
    accessStatus: "revoked",
    accessSource: "stripe",
    accessHistory: [{ action: "revoked", source: "stripe" }],
    async save() { this.saved = true; },
    async populate() { return this; },
  };
  const { response, purchaseCreated } = await callGrant({ student, course, existing });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body, existing);
  assert.equal(existing.saved, true);
  assert.equal(existing.accessStatus, "active");
  assert.equal(existing.accessSource, "manual");
  assert.equal(existing.accessHistory.length, 2);
  assert.equal(existing.accessHistory[1].action, "granted");
  assert.equal(existing.accessHistory[1].source, "manual");
  assert.equal(purchaseCreated, false);
});
