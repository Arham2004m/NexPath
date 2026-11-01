export function notFound(req, res) {
  res.status(404).json({ message: 'Route not found.' });
}

// Client mistakes get a short, safe message; unexpected failures are logged here and never described to the client.
const CLIENT_ERRORS = {
  'entity.parse.failed': [400, 'The request body is not valid JSON.'],
  'entity.too.large': [413, 'The request body is too large.'],
  'encoding.unsupported': [415, 'Unsupported request encoding.'],
  'request.aborted': [400, 'The request was interrupted.']
};

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err.code === 11000) return res.status(409).json({ message: 'An account with this email already exists', errors: { email: 'Email is already registered' } });
  const known = CLIENT_ERRORS[err.type];
  if (known) return res.status(known[0]).json({ message: known[1] });
  const status = err.statusCode || err.status || 500;
  if (status >= 500) {
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
  res.status(status).json({ message: 'The request could not be processed.' });
}
