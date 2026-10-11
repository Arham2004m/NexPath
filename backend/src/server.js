import 'dotenv/config';
import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { seedQuestions } from './scripts/seedQuestions.js';
import { loadGraph } from './services/graphStore.js';

const port = process.env.PORT || 5000;

try {
  const { nodes, graphVersion } = loadGraph(); // refuses to start on an invalid knowledge graph
  console.log(`Knowledge graph ${graphVersion}: ${nodes.length} skills`);
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
