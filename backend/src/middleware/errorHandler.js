export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);
  if (err.code === 11000) return res.status(409).json({ message: 'An account with this email already exists', errors: { email: 'Email is already registered' } });
  const status = err.statusCode || 500;
  // Unexpected errors never leak internals to the client; they are already logged above.
  res.status(status).json({ message: status >= 500 ? 'Something went wrong. Please try again.' : err.message });
}
