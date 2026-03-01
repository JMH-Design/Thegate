"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  TopicNode,
  computeConnections,
} from "@/lib/knowledge-map/connections";
import { Topic, UserProfile } from "@/lib/types";

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((mod) => mod.default),
  { ssr: false }
);

interface CanvasMapProps {
  topics: Topic[];
  profile: UserProfile | null;
  width?: number;
  height?: number;
}

const GOLD = "#D4AF37";
const SURFACE = "#242424";
const BORDER = "#3A3A3A";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#B8B8B8";
const TEXT_MUTED = "#808080";
const SUCCESS = "#22C55E";
const AMBER = "#F59E0B";

function getNodeColor(status: string): string {
  switch (status) {
    case "strong":
      return GOLD;
    case "needs_review":
      return AMBER;
    default:
      return SURFACE;
  }
}

function getNodeSize(depth: number): number {
  return 8 + depth * 2;
}

export function CanvasMap({
  topics,
  profile,
  width,
  height,
}: CanvasMapProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [hoverNode, setHoverNode] = useState<string | null>(null);

  useEffect(() => {
    if (width != null && height != null) {
      setDimensions({ width, height });
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0]?.contentRect ?? {};
      if (w && h) setDimensions({ width: w, height: h });
    });
    ro.observe(el);
    setDimensions({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, [width, height]);

  const { nodes, edges } = useMemo(
    () => computeConnections(topics, profile),
    [topics, profile]
  );

  const graphData = useMemo(() => {
    return {
      nodes: nodes.map((n) => ({
        ...n,
        id: n.id,
      })),
      links: edges.map((e) => ({
        source: e.source,
        target: e.target,
        label: e.label,
      })),
    };
  }, [nodes, edges]);

  const handleNodeClick = useCallback(
    (node: Record<string, unknown>) => {
      const topicId = (node.topicId ?? node.id) as string | undefined;
      if (topicId) {
        router.push(`/session/${topicId}`);
      }
    },
    [router]
  );

  const nodeCanvasObject = useCallback(
    (node: Record<string, unknown>, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as unknown as TopicNode & { x?: number; y?: number };
      const label = String(n.name ?? "");
      const fontSize = 12 / globalScale;
      const size = getNodeSize(Number(n.depth ?? 1));
      const color = getNodeColor(String(n.status ?? "developing"));
      const isHover = hoverNode === n.id;

      ctx.beginPath();
      ctx.arc(n.x ?? 0, n.y ?? 0, size, 0, 2 * Math.PI);
      ctx.fillStyle = isHover ? color : SURFACE;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = isHover ? 2 : 1;
      ctx.stroke();

      ctx.font = `${fontSize}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = TEXT_PRIMARY;
      const lines = label.length > 20 ? label.slice(0, 20) + "…" : label;
      ctx.fillText(lines, n.x ?? 0, (n.y ?? 0) + size + 10);
    },
    [hoverNode]
  );

  const nodePointerAreaPaint = useCallback(
    (node: Record<string, unknown>, color: string, ctx: CanvasRenderingContext2D) => {
      const n = node as unknown as TopicNode & { x?: number; y?: number };
      const size = getNodeSize(Number(n.depth ?? 1)) + 4;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(n.x ?? 0, n.y ?? 0, size, 0, 2 * Math.PI);
      ctx.fill();
    },
    []
  );

  if (topics.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="w-full min-h-[400px] rounded-[--radius-card] border border-border overflow-hidden bg-bg-secondary"
    >
      <ForceGraph2D
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#1A1A1A"
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode="replace"
        nodePointerAreaPaint={nodePointerAreaPaint}
        onNodeClick={handleNodeClick}
        onNodeHover={(n) => setHoverNode(n ? String((n as Record<string, unknown>).id) : null)}
        linkColor={() => "rgba(212, 175, 55, 0.5)"}
        linkWidth={1}
        linkLineDash={[4, 4]}
        linkLabel={(link: Record<string, unknown>) => (link.label as string) ?? ""}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        cooldownTicks={100}
      />
    </div>
  );
}
