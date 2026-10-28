import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import app from "../app.js";

const webhookSecret = "whsec_unit_test_signing_secret";
process.env.STRIPE_SECRET_KEY = "sk_test_unit_test_key";
process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

test("Stripe webhook verifies the signature over the raw request body", async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const payload = JSON.stringify({
    id: "evt_test_unknown",
    object: "event",
    type: "customer.created",
    created: 1,
    data: { object: { id: "cus_test", object: "customer" } },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
  const response = await fetch(`http://127.0.0.1:${address.port}/api/payments/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });

  const rejected = await fetch(`http://127.0.0.1:${address.port}/api/payments/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": "invalid" },
    body: payload,
  });
  assert.equal(rejected.status, 400);
  assert.deepEqual(await rejected.json(), { error: "Invalid Stripe webhook signature." });
});
