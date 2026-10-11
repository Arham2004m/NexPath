import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Question from '../models/Question.js';
import { DOMAIN_KEYS } from '../data/domains.js';

const bankUrl = new URL('../data/questions.json', import.meta.url);

// Idempotent: upserts by question id. With onlyIfEmpty, does nothing once seeded.
export async function seedQuestions({ onlyIfEmpty = false } = {}) {
  if (onlyIfEmpty && await Question.estimatedDocumentCount() > 0) return 0;
  const bank = JSON.parse(await readFile(bankUrl, 'utf-8'));
  const ops = DOMAIN_KEYS.flatMap((domain) => (bank[domain] || []).map((q) => ({
    updateOne: {
      filter: { id: q.id },
      update: { $set: { domain, difficulty: q.difficulty, question: q.question, options: q.options, correct: q.correct } },
      upsert: true
    }
  })));
  if (ops.length) await Question.bulkWrite(ops);
  console.log(`Seeded ${ops.length} questions`);
  return ops.length;
}

// `npm run seed`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await import('dotenv/config');
  const { connectDatabase, disconnectDatabase } = await import('../config/db.js');
  try { await connectDatabase(); await seedQuestions(); } finally { await disconnectDatabase(); }
}
