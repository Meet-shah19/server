import "./src/config/env.js";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";

const port = process.env.PORT || 4000;

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in the server .env file.");
}

await connectDB();
app.listen(port, () => {
  console.log(`LMS API listening on port ${port}`);
});
