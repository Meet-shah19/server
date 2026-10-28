export default function errorHandler(error, _req, res, _next) {
  let status = error.status || 500;
  let message = status === 500
    ? "An unexpected server error occurred. Check the API server logs."
    : error.message;

  if (error.name === "ValidationError" || error.name === "CastError") {
    status = 400;
    message = error.message;
  } else if (error.code === 11000) {
    status = 409;
    message = "A record with that value already exists.";
  } else if (error.name === "MongooseServerSelectionError") {
    status = 503;
    message = "The database is unavailable. Check the MongoDB connection and try again.";
  }

  if (status === 500) console.error(error);
  res.status(status).json({ error: message });
}
