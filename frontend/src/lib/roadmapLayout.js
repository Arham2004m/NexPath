// Layered top-to-bottom layout for the skill tree. Pure: nodes and edges in, positions out.
// Depth = longest prerequisite chain, so the path reads like a spine that branches and rejoins.
export const NODE_WIDTH = 248;
export const NODE_HEIGHT = 96;
const GAP_X = 40;
const GAP_Y = 84;

export function layoutRoadmap(nodes, edges) {
  const parents = new Map(nodes.map((n) => [n.id, []]));
  for (const { from, to } of edges) if (parents.has(to) && parents.has(from)) parents.get(to).push(from);

  const depth = new Map();
  const depthOf = (id) => {
    if (depth.has(id)) return depth.get(id);
    const value = parents.get(id).length ? 1 + Math.max(...parents.get(id).map(depthOf)) : 0;
    depth.set(id, value);
    return value;
  };
  nodes.forEach((n) => depthOf(n.id));

  const layers = [];
  for (const node of [...nodes].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
    (layers[depth.get(node.id)] ||= []).push(node);
  }

  const x = new Map();
  const widest = Math.max(...layers.map((layer) => layer.length));
  const fullWidth = widest * NODE_WIDTH + (widest - 1) * GAP_X;
  layers.forEach((layer, row) => {
    // Order by the average position of parents so edges cross as little as possible.
    if (row > 0) layer.sort((a, b) => average(parents.get(a.id), x) - average(parents.get(b.id), x) || a.order - b.order);
    const width = layer.length * NODE_WIDTH + (layer.length - 1) * GAP_X;
    layer.forEach((node, i) => x.set(node.id, (fullWidth - width) / 2 + i * (NODE_WIDTH + GAP_X)));
  });

  const positions = {};
  layers.forEach((layer, row) => layer.forEach((node) => { positions[node.id] = { x: x.get(node.id), y: row * (NODE_HEIGHT + GAP_Y) }; }));
  return positions;
}

const average = (ids, x) => (ids.length ? ids.reduce((sum, id) => sum + (x.get(id) ?? 0), 0) / ids.length : 0);
