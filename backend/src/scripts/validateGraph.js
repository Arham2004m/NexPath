// `npm run validate-graph`: exits non-zero when the knowledge graph is invalid.
import { fileURLToPath } from 'node:url';
import { readGraphFiles } from '../services/graphStore.js';
import { computeGraphVersion, validateGraph } from '../engine/graph.js';

const { nodes, goalPaths } = readGraphFiles();
const { errors, warnings } = validateGraph(nodes, goalPaths);
console.log(`Nodes: ${nodes.length}; topics: ${nodes.reduce((s, n) => s + n.topics.length, 0)}; resources: ${nodes.reduce((s, n) => s + n.resources.length, 0)}; version ${computeGraphVersion(nodes, goalPaths)}`);
for (const warning of warnings) console.warn(`warning: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exit(1);
}
console.log('Knowledge graph is valid.');
