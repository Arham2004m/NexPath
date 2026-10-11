// Loads the knowledge graph from src/data once, validates it and keeps it in memory.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertValidGraph, computeGraphVersion } from '../engine/graph.js';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
let cached = null;

export function readGraphFiles(dir = dataDir) {
  const graphDir = path.join(dir, 'graph');
  const nodes = readdirSync(graphDir).filter((f) => f.endsWith('.json')).sort()
    .flatMap((file) => JSON.parse(readFileSync(path.join(graphDir, file), 'utf-8')).nodes);
  const goalPaths = JSON.parse(readFileSync(path.join(dir, 'goalPaths.json'), 'utf-8'));
  return { nodes, goalPaths };
}

// Throws GraphError on an invalid graph, so the server refuses to start with bad data.
export function loadGraph({ force = false } = {}) {
  if (cached && !force) return cached;
  const { nodes, goalPaths } = readGraphFiles();
  const { warnings } = assertValidGraph(nodes, goalPaths);
  cached = { nodes, goalPaths, graphVersion: computeGraphVersion(nodes, goalPaths), warnings };
  return cached;
}
