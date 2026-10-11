import dns from 'node:dns';
import mongoose from 'mongoose';

// Some ISP/Windows resolvers refuse the SRV lookups mongodb+srv:// needs.
// Opt in with DNS_SERVERS=8.8.8.8,1.1.1.1 only if you hit that problem.
function applyDnsOverride() {
  const servers = (process.env.DNS_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (servers.length) dns.setServers(servers);
}

function explain(error) {
  const text = `${error.code || ''} ${error.message}`;
  if (/ENOTFOUND|ECONNREFUSED|querySrv|EREFUSED/i.test(text)) return 'DNS lookup failed. Set DNS_SERVERS=8.8.8.8,1.1.1.1 in backend/.env, or use the non-SRV (mongodb://) connection string from Atlas.';
  if (/auth/i.test(text)) return 'Authentication failed. Check the username and password in MONGO_URI (URL-encode special characters).';
  if (/ServerSelection|timed out|whitelist|allowlist/i.test(text)) return 'Could not reach the cluster. In Atlas, add your current IP under Network Access, and check the cluster is not paused.';
  return 'Check MONGO_URI in backend/.env.';
}

export async function connectDatabase() {
  const uri = process.env.MONGO_URI;
  if (!uri || uri.includes('<username>') || uri.includes('<password>')) {
    throw new Error('MONGO_URI is missing or still the placeholder from .env.example. Set it in backend/.env.');
  }
  applyDnsOverride();
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  } catch (error) {
    error.hint = explain(error);
    throw error;
  }
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
