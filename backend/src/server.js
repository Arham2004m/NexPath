import 'dotenv/config';
import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { seedQuestions } from './scripts/seedQuestions.js';

const port = process.env.PORT || 5000;

try {
  await connectDatabase();
  await seedQuestions();
} catch (error) {
  console.error(`Startup failed: ${error.message}`);
  if (error.hint) console.error(`Hint: ${error.hint}`);
  process.exit(1);
}

const server = app.listen(port, () => console.log(`API listening on ${port}`));
const shutdown = () => server.close(async () => { await disconnectDatabase(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
