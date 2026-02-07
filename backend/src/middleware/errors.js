export function notFound(req, res) {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(err, req, res, next) { // eslint-disable-line
  console.error(err);
  // Multer errors: https://github.com/expressjs/multer#error-handling
  const status = err.code === "LIMIT_FILE_SIZE" ? 413 : (err.status || 500);
  res.status(status).json({
    error: status === 500
      ? "Server error"
      : (err.message || (status === 413 ? "File too large" : "Error"))
  });
}
