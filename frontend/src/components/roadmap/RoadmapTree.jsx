import { useMemo } from 'react';
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import SkillNode from './SkillNode';
import { layoutRoadmap, NODE_HEIGHT, NODE_WIDTH } from '../../lib/roadmapLayout';

const nodeTypes = { skill: SkillNode };

// Skill tree: one node per skill, edges are prerequisites, laid out top to bottom like a path.
export default function RoadmapTree({ roadmap, selectedId, onSelect }) {
  const { nodes, edges } = useMemo(() => {
    const positions = layoutRoadmap(roadmap.nodes, roadmap.edges);
    return {
      nodes: roadmap.nodes.map((node) => ({ id: node.id, type: 'skill', position: positions[node.id], data: { node, selected: node.id === selectedId, onSelect }, draggable: false, width: NODE_WIDTH, height: NODE_HEIGHT })),
      edges: roadmap.edges.map(({ from, to }) => ({
        id: `${from}->${to}`, source: from, target: to, type: 'smoothstep',
        style: { stroke: '#3282B8', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#3282B8' }
      }))
    };
  }, [roadmap, selectedId, onSelect]);

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
