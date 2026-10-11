// Bakes curated resources from the CSV into the knowledge-graph node files.
// Usage: npm run import-resources [-- path/to/resources.csv]
// The runtime never reads the CSV; re-running is safe (resources are rebuilt from the CSV each time).
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
const graphDir = path.join(dataDir, 'graph');
const defaultCsv = path.join(dataDir, 'resources', 'nexpath-resources.csv');

// Minimal RFC 4180 parser: quoted fields, escaped quotes, commas and newlines inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((h, i) => [h.replace(/^﻿/, '').trim(), (values[i] ?? '').trim()])));
}

const TYPE_MAP = {
  Course: 'course', Article: 'article', Practice: 'practice', 'Official Reference': 'reference', Video: 'video',
  'Book / Notes': 'book', 'Project Idea': 'project', Playlist: 'video', 'Research Paper': 'paper'
};
const PRIORITY_RANK = { 'Must-have': 0, High: 1, Recommended: 2, Medium: 3, Supplementary: 4 };

const cleanTime = (text) => text.replace(/�+/g, '–').replace(/\s+/g, ' ').trim();

export function toResource(row) {
  return {
    id: row['JSON ID'],
    type: TYPE_MAP[row['Resource Type']] || 'article',
    title: row['Resource Title'],
    url: row.URL,
    provider: row['Provider / Creator'] || null,
    free: row['Free / Paid'] === 'Free',
    pricing: row['Free / Paid'] || null,
    difficulty: row.Difficulty || null,
    time: cleanTime(row['Estimated Time'] || '') || null,
    why: row['Why Recommended'] || null,
    priority: row.Priority || 'Recommended'
  };
}

export function assignRows(rows, map) {
  const rules = map.rules.map((rule) => ({ ...rule, re: new RegExp(rule.match, 'i') }));
  const assigned = new Map();
  const unmapped = [];
  for (const row of rows) {
    const rule = rules.find((r) => r.tracks.includes(row.Track) && r.re.test(r.on === 'title' ? row['Resource Title'] : row['Skill / Topic']));
    if (!rule) { unmapped.push(row); continue; }
    for (const node of [rule.node, ...(rule.also || [])]) {
      if (!assigned.has(node)) assigned.set(node, []);
      assigned.get(node).push(row);
    }
  }
  return { assigned, unmapped };
}

// Priority first, then verified rows, then at most maxPerType per type so a node is not all videos.
export function pickResources(rows, { maxPerNode, maxPerType }) {
  const seenUrls = new Set();
  const ranked = rows
    .filter((r) => r.URL && !seenUrls.has(r.URL) && seenUrls.add(r.URL))
    .sort((a, b) => (PRIORITY_RANK[a.Priority] ?? 5) - (PRIORITY_RANK[b.Priority] ?? 5) || (b.Verified === 'checked') - (a.Verified === 'checked'));
  const perType = {};
  const picked = [];
  for (const row of ranked) {
    const type = TYPE_MAP[row['Resource Type']] || 'article';
    if ((perType[type] || 0) >= maxPerType) continue;
    perType[type] = (perType[type] || 0) + 1;
    picked.push(toResource(row));
    if (picked.length >= maxPerNode) break;
  }
  return picked;
}

async function main() {
  const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultCsv;
  const rows = parseCsv(await readFile(csvPath, 'utf-8'));
  const map = JSON.parse(await readFile(path.join(dataDir, 'resources', 'resourceMap.json'), 'utf-8'));
  const { assigned, unmapped } = assignRows(rows, map);

  const files = (await readdir(graphDir)).filter((f) => f.endsWith('.json'));
  const nodeIds = new Set();
  const report = { csvRows: rows.length, nodes: {}, unmappedByTrack: {}, rulesWithUnknownNode: [] };
  for (const file of files) {
    const filePath = path.join(graphDir, file);
    const data = JSON.parse(await readFile(filePath, 'utf-8'));
    for (const node of data.nodes) {
      nodeIds.add(node.id);
      const candidates = assigned.get(node.id) || [];
      node.resources = pickResources(candidates, map);
      if (node.resources.length < 3) node.needsReview = true; else delete node.needsReview;
      report.nodes[node.id] = { candidates: candidates.length, kept: node.resources.length, needsReview: !!node.needsReview };
    }
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
  }
  report.rulesWithUnknownNode = [...new Set(map.rules.flatMap((r) => [r.node, ...(r.also || [])]))].filter((id) => !nodeIds.has(id));
  for (const row of unmapped) report.unmappedByTrack[row.Track] = (report.unmappedByTrack[row.Track] || 0) + 1;
  report.unmappedSamples = unmapped.slice(0, 40).map((r) => `${r.Track} | ${r['Skill / Topic']}`);
  await writeFile(path.join(dataDir, 'resources', 'import-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  const kept = Object.values(report.nodes).reduce((s, n) => s + n.kept, 0);
  console.log(`CSV rows: ${rows.length}; assigned to nodes: ${rows.length - unmapped.length}; unmapped: ${unmapped.length}; resources kept in graph: ${kept}`);
  console.log('Nodes needing review (<3 resources):', Object.entries(report.nodes).filter(([, n]) => n.needsReview).map(([id]) => id).join(', ') || 'none');
  if (report.rulesWithUnknownNode.length) console.warn('Rules point at unknown nodes:', report.rulesWithUnknownNode.join(', '));
  console.log('Unmapped by track:', report.unmappedByTrack);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
