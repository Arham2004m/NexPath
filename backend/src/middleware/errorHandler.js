export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);
  if (err.code === 11000) return res.status(409).json({ message: 'An account with this email already exists', errors: { email: 'Email is already registered' } });
  const status = err.statusCode || 500;
  res.status(status).json({ message: err.message || 'Something went wrong. Please try again.' });
}
