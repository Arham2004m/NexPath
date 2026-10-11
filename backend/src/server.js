import 'dotenv/config';
import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { seedQuestions } from './scripts/seedQuestions.js';
import { loadGraph } from './services/graphStore.js';

const port = process.env.PORT || 5000;

const missing = ['MONGO_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CLIENT_URL'].filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}. Copy backend/.env.example to backend/.env and fill them in.`);
  process.exit(1);
}

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
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.error(`Port ${port} is already in use. Stop the other process or set PORT in backend/.env`);
  else if (error.code === 'EACCES') console.error(`Port ${port} needs elevated permission. Set a different PORT in backend/.env`);
  else console.error(`Server error: ${error.message}`);
  disconnectDatabase().finally(() => process.exit(1));
});
const shutdown = () => server.close(async () => { await disconnectDatabase(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
