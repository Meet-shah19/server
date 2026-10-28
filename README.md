# LMS API

Node.js, Express, and MongoDB API for the admin, instructor, and student portals.

## Setup

1. Install Node.js and MongoDB Community Server.
2. In `server/`, install dependencies:

   ```sh
   npm install
   ```

3. Copy `.env.example` to `.env` and set a unique, long `JWT_SECRET`.
4. Start MongoDB and optionally seed development accounts and courses:

   ```sh
   npm run seed
   ```

5. Start the API with `npm run dev` (or `npm start` without nodemon). It listens on `http://127.0.0.1:4000`.
6. Run backend checks with `npm test`.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `4000` |
| `MONGO_URI` | MongoDB URI | `mongodb://127.0.0.1:27017/lms` |
| `JWT_SECRET` | Bearer-token signing secret | Required |
| `JWT_EXPIRES_IN` | JWT lifetime | `7d` |
| `FRONTEND_URL` | Frontend origin used for Stripe return URLs | `http://127.0.0.1:5173` |
| `STRIPE_SECRET_KEY` | Stripe API key (`sk_test_...` in test mode) | Required for paid checkout |
| `STRIPE_WEBHOOK_SECRET` | Endpoint signing secret (`whsec_...`) | Required to confirm paid checkout |
| `STRIPE_SUCCESS_URL` | Checkout success redirect; include Stripe's `{CHECKOUT_SESSION_ID}` placeholder | `${FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}` |
| `STRIPE_CANCEL_URL` | Checkout cancel redirect | `${FRONTEND_URL}/checkout/cancel` |

### Stripe test and live setup

Use Stripe **test mode** keys (`sk_test_...`) during development. Configure a webhook endpoint for `POST /api/payments/webhook` and subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`. Copy that endpoint's signing secret (`whsec_...`) to `STRIPE_WEBHOOK_SECRET`. For local development, Stripe CLI can forward events to `http://127.0.0.1:4000/api/payments/webhook`; use the CLI-provided signing secret.

For production, switch to live-mode keys (`sk_live_...`) and a live webhook endpoint's signing secret. Keep both keys private and never commit `.env`. The server always sets Checkout currency to **INR** and calculates the amount from the stored course price (whole rupees, converted to paise). Browser redirects do not grant access; only a correctly signed webhook confirming the expected amount, currency, student, course, and session creates paid enrollment.

## Course lifecycle and API

Course status values are exactly `draft`, `pending_review`, `changes_requested`, `approved`, `published`, and `rejected`. Course price is a non-negative whole INR amount. Each lesson has an explicit `isFreeIntroduction: boolean`; review submission requires exactly one lesson with that flag set to `true`. Every lesson needs a title and content. Submitted quiz questions need at least two options and a valid `correctAnswer` index.

Course write payloads use fields such as:

```json
{
  "title": "Example course",
  "description": "Course description",
  "price": 1500,
  "lessons": [
    { "title": "Introduction", "type": "video", "content": "Preview", "isFreeIntroduction": true },
    { "title": "Lesson 1", "type": "text", "content": "Paid content", "isFreeIntroduction": false }
  ]
}
```

The API sets new courses to `draft`; callers cannot set lifecycle status through a course create/update payload. Review data is `reviewFeedback: string` and `reviewHistory: [{ action, actor, at, note }]`. History actions are `submitted`, `resubmitted`, `approved`, `changes_requested`, `rejected`, `published`, and `unpublished`.

| Method and path | Role | Contract |
| --- | --- | --- |
| `GET /api/courses` | Optional auth | Array of student catalogue courses with `id`, `title`, `description`, `category`, `level`, `price`, `status`, `modules`, `lessons` (titles/types/IDs/free-intro flags only), `quizzes: []`, `instructor`, `instructorId`, `enrolled: false`, `access: "preview"`, and timestamps |
| `GET /api/courses/:id` | Auth required | Student payload has those course fields; `lessons` also includes content only for the free introduction unless enrolled. `quizzes` is `[]` before enrollment; `enrolled` and `access` reflect active access. Students receive 404 for non-visible courses |
| `GET /api/courses/:id/lessons/:lessonId` | Auth required | `{ courseId, lesson, access }`; students need active enrollment except for the one free introduction |
| `POST /api/courses` | Instructor/admin | Create a draft; instructor is assigned to self |
| `PUT /api/courses/:id` | Owner instructor/admin | Edit content. Pending-review courses are locked to instructors. Instructor edits to approved/published courses move them to `pending_review`, retaining the previous published snapshot; admin edits to published courses update the live snapshot directly |
| `POST /api/courses/:id/submit` | Owner instructor | Submit draft, changes-requested, or rejected course; returns the course and `reviewHistory` |
| `GET /api/admin/courses/review-queue` | Admin | Pending-review courses |
| `POST /api/admin/courses/:id/review` | Admin | Body `{ "action": "approve" \| "request_changes" \| "reject", "note": "..." }`; a note is required for changes/rejection |
| `POST /api/admin/courses/:id/publish` | Admin | Publish an approved version; optional `{ "note": "..." }` |
| `POST /api/admin/courses/:id/unpublish` | Admin | Hide a published course; optional `{ "note": "..." }` |

Students must authenticate for course details. They get HTTP 404 for nonpublished courses (except while a prior published snapshot remains live during review of edits). Before enrollment, only lesson titles and the single free introduction's content are available; quizzes and all other lesson content are withheld. Paid content, quizzes, notes, progress, and certificates require enrollment. Review history and feedback are instructor/admin-only.

## Checkout, purchases, and access

| Method and path | Role | Contract |
| --- | --- | --- |
| `POST /api/payments/checkout` | Student | Body `{ "courseId": "..." }`; returns `{ purchaseId, checkoutSessionId, checkoutUrl, amount, currency }` |
| `GET /api/payments/success?session_id=...` | Student | HTTP 202 while webhook confirmation is pending, otherwise 200; body `{ purchase: { id, status, amount, currency, course: { id, title } }, enrollmentConfirmed, message? }`; does not create enrollment |
| `POST /api/payments/webhook` | Stripe | Raw-body signature verified against `STRIPE_WEBHOOK_SECRET`; responds `{ "received": true }` |
| `POST /api/enrollments` | Student | Body `{ "courseId": "..." }`; creates a `free` purchase and enrollment only for zero-price courses; paid courses return HTTP 402 with instructions to use Checkout |
| `GET /api/admin/purchases` | Admin | Purchase records, including status, INR amount, student, and course |
| `GET /api/admin/enrollments` | Admin | Access/enrollment records |
| `POST /api/admin/enrollments` | Admin | Body `{ "studentId": "...", "courseId": "..." }`; creates manual access or reactivates a revoked record, returning the enrollment with `accessSource: "manual"`, `grantedBy`, and `accessHistory`; does not create a purchase |
| `DELETE /api/admin/enrollments/:id` | Admin | Revoke that enrollment |

Purchase statuses are `pending`, `paid`, `failed`, `refunded`, and `free`; provider is `stripe` or `free`. A verified paid webhook creates an enrollment idempotently with `accessSource: "stripe"`; zero-price enrollment uses `accessSource: "free"`. Enrollment records include `accessStatus: "active" | "revoked"` and `accessHistory: [{ action, source, actor, at, note }]`; manual grants are specifically recorded with `accessSource: "manual"` and the granting admin as `grantedBy`, without a corresponding Purchase. Admin access routes list, grant/reactivate, and revoke access; paid purchases still require the verified webhook. The frontend success route should poll/check `GET /api/payments/success?session_id=...`; it must not assume a redirect means payment succeeded.

## Development accounts

`npm run seed` creates or refreshes the local accounts below. Passwords are hashed in MongoDB.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@lms.com` | `Admin@123` |
| Instructor | `instructor@lms.com` | `Instructor@123` |
| Student | `student@lms.com` | `Student@123` |

Use these credentials only with a local development database.
