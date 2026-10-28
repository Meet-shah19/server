import Stripe from "stripe";
import Course from "../models/Course.js";
import Enrollment from "../models/Enrollment.js";
import Purchase from "../models/Purchase.js";
import { isStudentVisible, normalizeInrPrice } from "../services/coursePolicy.js";

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw Object.assign(new Error("Stripe is not configured."), { status: 503 });
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function stripeUrls() {
  const frontend = (process.env.FRONTEND_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
  return {
    success_url: process.env.STRIPE_SUCCESS_URL ||
      `${frontend}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: process.env.STRIPE_CANCEL_URL || `${frontend}/checkout/cancel`,
  };
}

export async function createCheckout(req, res, next) {
  let purchase;
  try {
    const course = await Course.findById(req.body?.courseId);
    if (!course || !isStudentVisible(course)) {
      return res.status(404).json({ error: "Published course not found." });
    }
    if (await Enrollment.exists({ student: req.user._id, course: course._id, accessStatus: "active" })) {
      return res.status(409).json({ error: "You already have access to this course." });
    }
    const isCurrentlyPublished = String(course.status || "").toLowerCase() === "published";
    const amount = normalizeInrPrice(isCurrentlyPublished ? course.price : course.publishedVersion?.price);
    if (amount === 0) return res.status(400).json({ error: "Free courses do not require checkout." });
    purchase = await Purchase.create({
      student: req.user._id,
      course: course._id,
      courseTitle: isCurrentlyPublished ? course.title : course.publishedVersion.title,
      amount,
      currency: "inr",
      provider: "stripe",
      status: "pending",
    });
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "inr",
          unit_amount: amount * 100,
          product_data: { name: isCurrentlyPublished ? course.title : course.publishedVersion.title },
        },
      }],
      client_reference_id: String(req.user._id),
      metadata: {
        purchaseId: String(purchase._id),
        studentId: String(req.user._id),
        courseId: String(course._id),
      },
      ...stripeUrls(),
    });
    purchase.checkoutSessionId = session.id;
    await purchase.save();
    return res.status(201).json({
      purchaseId: String(purchase._id),
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
      amount,
      currency: "inr",
    });
  } catch (error) {
    if (purchase) {
      purchase.status = "failed";
      await purchase.save().catch(() => {});
    }
    return next(error);
  }
}

export async function checkoutSuccess(req, res, next) {
  try {
    const sessionId = String(req.query.session_id || "");
    if (!sessionId) return res.status(400).json({ error: "session_id is required." });
    const purchase = await Purchase.findOne({
      checkoutSessionId: sessionId,
      student: req.user._id,
    });
    if (!purchase) return res.status(404).json({ error: "Checkout session not found." });
    const courseId = String(purchase.course);
    const course = await Course.findById(purchase.course).select("title");
    const enrollment = purchase.course
      ? await Enrollment.exists({ student: req.user._id, course: purchase.course, accessStatus: "active" })
      : null;
    return res.status(purchase.status === "pending" ? 202 : 200).json({
      purchase: {
        id: String(purchase._id),
        status: purchase.status,
        amount: purchase.amount,
        currency: purchase.currency,
        course: { id: courseId, title: course?.title || purchase.courseTitle },
      },
      enrollmentConfirmed: Boolean(enrollment),
      message: purchase.status === "pending"
        ? "Payment confirmation is pending; access is granted only after the signed Stripe webhook."
        : undefined,
    });
  } catch (error) {
    return next(error);
  }
}

async function applyPaidSession(session) {
  if (session.payment_status !== "paid") return;
  const { purchaseId, studentId, courseId } = session.metadata || {};
  if (!purchaseId || !studentId || !courseId) {
    throw Object.assign(new Error("Stripe session is missing purchase metadata."), { status: 400 });
  }
  const purchase = await Purchase.findById(purchaseId);
  if (!purchase || String(purchase.student) !== studentId || String(purchase.course) !== courseId ||
    purchase.checkoutSessionId !== session.id || session.currency !== "inr" ||
    session.mode !== "payment" || session.client_reference_id !== studentId ||
    session.amount_total !== purchase.amount * 100) {
    throw Object.assign(new Error("Stripe session does not match the recorded purchase."), { status: 400 });
  }
  await Enrollment.updateOne(
    { student: purchase.student, course: purchase.course },
    {
      $set: { accessStatus: "active", accessSource: "stripe" },
      $setOnInsert: { student: purchase.student, course: purchase.course },
    },
    { upsert: true }
  );
  await Purchase.updateOne(
    { _id: purchase._id, status: { $ne: "paid" } },
    { $set: { status: "paid", paymentIntentId: session.payment_intent || null, paidAt: new Date() } }
  );
}

export async function stripeWebhook(req, res) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: "Stripe webhook is not configured." });
  }
  const signature = req.get("stripe-signature");
  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).json({ error: "Invalid Stripe webhook signature." });
  }
  try {
    if (event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded") {
      await applyPaidSession(event.data.object);
    } else if (event.type === "checkout.session.async_payment_failed" ||
      event.type === "checkout.session.expired") {
      await Purchase.updateOne(
        { checkoutSessionId: event.data.object.id, status: "pending" },
        { $set: { status: "failed" } }
      );
    }
    return res.json({ received: true });
  } catch (error) {
    if (!error.status) console.error(error);
    return res.status(error.status || 500).json({
      error: error.status && error.status < 500 ? error.message : "Webhook processing failed.",
    });
  }
}
