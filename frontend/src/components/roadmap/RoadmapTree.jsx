import { useMemo } from 'react';
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import SkillNode from './SkillNode';
import { layoutRoadmap, NODE_HEIGHT, NODE_WIDTH } from '../../lib/roadmapLayout';

const nodeTypes = { skill: SkillNode };

// Skill tree: one node per skill, edges are prerequisites, laid out top to bottom like a path.
export default function RoadmapTree({ roadmap, progress, selectedId, onSelect }) {
  const { nodes, edges } = useMemo(() => {
    // Optional extras (added when the student is ahead) sit below the skills they build on, with dashed outlines.
    const allNodes = [...roadmap.nodes, ...(roadmap.extras?.nodes || [])];
    const allEdges = [...roadmap.edges, ...(roadmap.extras?.edges || [])];
    const positions = layoutRoadmap(allNodes, allEdges);
    return {
      nodes: allNodes.map((node) => ({ id: node.id, type: 'skill', position: positions[node.id], data: { node, selected: node.id === selectedId, onSelect, done: !!progress?.nodes?.[node.id]?.complete }, draggable: false, width: NODE_WIDTH, height: NODE_HEIGHT })),
      edges: allEdges.map(({ from, to }) => ({
        id: `${from}->${to}`, source: from, target: to, type: 'smoothstep',
        style: { stroke: '#3282B8', strokeWidth: 2, ...(roadmap.extras?.nodes?.some((node) => node.id === to) ? { strokeDasharray: '6 4' } : {}) }, markerEnd: { type: MarkerType.ArrowClosed, color: '#3282B8' }
      }))
    };
  }, [roadmap, progress, selectedId, onSelect]);

  return (
    <div className="surface-card h-[72vh] min-h-[460px] w-full" role="region" aria-label="Skill tree. Use Tab to move between skills and Enter to open details.">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        fitView fitViewOptions={{ padding: 0.18, maxZoom: 1 }} minZoom={0.3} maxZoom={1.4}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}
      >
        <Background color="#C9E1EF" gap={28} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
