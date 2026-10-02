import React, { useMemo, useCallback } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  NodeProps,
  Handle,
  Position
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useAppStore } from '../store'
import { useI18n } from '../i18n/context'
import type { PolishHistoryNode } from '../types'
import { Clock, FileText } from 'lucide-react'

/** Custom node component for each polishing step */
function PolishNode({ data, selected }: NodeProps) {
  const { label, timestamp, scope, mode, text, isActive } = data
  const preview = text.length > 80 ? text.slice(0, 80) + '...' : text

  return (
    <div
      className={`px-3 py-2 rounded-lg border-2 shadow-sm min-w-[180px] max-w-[240px] transition-all ${
        isActive
          ? 'border-primary-500 bg-primary-50 shadow-primary-200'
          : selected
            ? 'border-primary-300 bg-white shadow-md'
            : 'border-surface-200 bg-white hover:shadow-md'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-surface-400 !w-2 !h-2" />

      <div className="flex items-center gap-1.5 mb-1">
        <FileText size={11} className={isActive ? 'text-primary-600' : 'text-surface-400'} />
        <span className="text-[11px] font-semibold text-surface-800 truncate">{label}</span>
      </div>

      <p className="text-[10px] text-surface-500 leading-snug line-clamp-3 mb-1.5">
        {preview}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
            scope === 'word' ? 'bg-blue-100 text-blue-700'
              : scope === 'sentence' ? 'bg-green-100 text-green-700'
                : 'bg-purple-100 text-purple-700'
          }`}>
            {scope}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
            mode === 'refinement' ? 'bg-amber-100 text-amber-700' : 'bg-pink-100 text-pink-700'
          }`}>
            {mode}
          </span>
        </div>
        <div className="flex items-center gap-0.5 text-[9px] text-surface-400">
          <Clock size={9} />
          {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-surface-400 !w-2 !h-2" />
    </div>
  )
}

const nodeTypes = { polishNode: PolishNode }

export default function PolishHistoryTree() {
  const { t } = useI18n()
  const session = useAppStore(s => {
    const active = s.sessions.find(sess => sess.id === s.activeSessionId)
    return active || null
  })
  const { restoreHistoryNode, showToast } = useAppStore()

  // Build ReactFlow nodes and edges from history
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!session || session.history.length === 0) {
      return { initialNodes: [], initialEdges: [] }
    }

    const history = session.history

    // Layout: compute levels (depth) for each node via BFS
    const childrenMap = new Map<string | null, PolishHistoryNode[]>()
    history.forEach(node => {
      const parentId = node.parentId
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, [])
      }
      childrenMap.get(parentId)!.push(node)
    })

    // Assign positions using a simple tree layout
    const positions = new Map<string, { x: number; y: number }>()
    let xOffset = 0
    const Y_SPACING = 150
    const X_SPACING = 280

    function layoutNode(nodeId: string | null, depth: number): void {
      const children = childrenMap.get(nodeId) || []
      if (children.length === 0) return

      children.forEach(child => {
        // First layout children to determine subtree width
        layoutNode(child.id, depth + 1)

        if (!positions.has(child.id)) {
          positions.set(child.id, { x: xOffset * X_SPACING, y: depth * Y_SPACING })
          xOffset++
        }
      })

      // If nodeId itself doesn't have a position yet and it's a real node
      if (nodeId && !positions.has(nodeId)) {
        // Center parent above children
        const childPositions = children.map(c => positions.get(c.id)!)
        const avgX = childPositions.reduce((sum, p) => sum + p.x, 0) / childPositions.length
        positions.set(nodeId, { x: avgX, y: (depth - 1) * Y_SPACING })
      }
    }

    // Start from roots (nodes with parentId = null)
    layoutNode(null, 0)

    // Handle root nodes that weren't placed by layoutNode (leaf roots)
    history.forEach(node => {
      if (!positions.has(node.id)) {
        positions.set(node.id, { x: xOffset * X_SPACING, y: 0 })
        xOffset++
      }
    })

    const nodes: Node[] = history.map((node, idx) => {
      const pos = positions.get(node.id) || { x: idx * X_SPACING, y: 0 }
      return {
        id: node.id,
        type: 'polishNode',
        position: pos,
        data: {
          label: `#${idx + 1}`,
          text: node.text,
          timestamp: node.timestamp,
          scope: node.scope,
          mode: node.mode,
          isActive: session.activeHistoryNodeId === node.id
        }
      }
    })

    const edges: Edge[] = history
      .filter(node => node.parentId)
      .map(node => ({
        id: `e-${node.parentId}-${node.id}`,
        source: node.parentId!,
        target: node.id,
        type: 'smoothstep',
        animated: session.activeHistoryNodeId === node.id,
        style: {
          stroke: session.activeHistoryNodeId === node.id ? '#3b82f6' : '#d1d5db',
          strokeWidth: session.activeHistoryNodeId === node.id ? 2 : 1
        }
      }))

    return { initialNodes: nodes, initialEdges: edges }
  }, [session])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    restoreHistoryNode(node.id)
    showToast(`Restored to version #${node.data.label}`, 'info')
  }, [restoreHistoryNode, showToast])

  if (!session || session.history.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-surface-400 text-sm">
        No polishing history yet
      </div>
    )
  }

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e5e7eb" gap={20} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => n.data?.isActive ? '#3b82f6' : '#e5e7eb'}
          style={{ height: 80, width: 120 }}
        />
      </ReactFlow>
    </div>
  )
}
