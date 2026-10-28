import { Router } from "express";
import { checkoutSuccess, createCheckout } from "../controllers/payment.controller.js";
import auth from "../middleware/auth.js";
import requireRole from "../middleware/requireRole.js";

const router = Router();
router.use(auth, requireRole("student"));
router.post("/checkout", createCheckout);
router.get("/success", checkoutSuccess);

export default router;
