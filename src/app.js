import express from "express";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import courseRoutes from "./routes/course.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import studentRoutes from "./routes/student.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import { stripeWebhook } from "./controllers/payment.controller.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), stripeWebhook);
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api", studentRoutes);
app.use((req, _res, next) => {
  next(Object.assign(new Error(`Route not found: ${req.method} ${req.path}`), { status: 404 }));
});
app.use(errorHandler);

export default app;
