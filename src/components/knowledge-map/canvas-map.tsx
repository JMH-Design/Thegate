"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";

import {
  TopicNode,
  computeConnections,
} from "@/lib/knowledge-map/connections";
import {
  getIconImage,
  getCachedIconImage,
} from "@/lib/knowledge-map/icon-cache";
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
const GOLD_FOCUS = "#E8C547";
const SURFACE_HOVER = "#2E2E2E";
const TEXT_PRIMARY = "#FFFFFF";
const SUCCESS = "#22C55E";
const AMBER = "#F59E0B";
const BG_SECONDARY = "#1A1A1A";

function getNodeStyles(status: string): {
  fill: string;
  stroke: string;
  labelColor: string;
} {
  switch (status) {
    case "strong":
      return { fill: "rgba(34, 197, 94, 0.15)", stroke: SUCCESS, labelColor: SUCCESS };
    case "needs_review":
      return { fill: "rgba(245, 158, 11, 0.15)", stroke: AMBER, labelColor: AMBER };
    default:
      return {
        fill: "rgba(212, 175, 55, 0.12)",
        stroke: GOLD,
        labelColor: TEXT_PRIMARY,
      };
  }
}

function getNodeSize(depth: number): number {
  return 14 + depth * 3;
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
  const [iconsReady, setIconsReady] = useState(false);

  const { nodes, edges } = useMemo(
    () => computeConnections(topics, profile),
    [topics, profile]
  );

  useEffect(() => {
    const iconNames = [
      ...new Set(
        nodes.map((n) => (n.icon && n.icon.trim() ? n.icon : "BookMarked"))
      ),
    ];
    Promise.all(iconNames.map((name) => getIconImage(name))).then(() => {
      setIconsReady(true);
    });
  }, [nodes]);

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
      const fontSize = Math.max(10, Math.min(14, 12 / globalScale));
      const size = getNodeSize(Number(n.depth ?? 1));
      const status = String(n.status ?? "developing");
      const styles = getNodeStyles(status);
      const isHover = hoverNode === n.id;

      const fillColor = isHover ? SURFACE_HOVER : styles.fill;
      const strokeColor = isHover ? GOLD_FOCUS : styles.stroke;
      const labelColor = isHover ? GOLD_FOCUS : styles.labelColor;

      ctx.beginPath();
      ctx.arc(n.x ?? 0, n.y ?? 0, size, 0, 2 * Math.PI);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isHover ? 2.5 : 1.5;
      ctx.stroke();

      const iconImg = getCachedIconImage(n.icon);
      if (iconImg && iconImg.complete) {
        const iconSize = size * 0.5;
        const iconX = (n.x ?? 0) - iconSize / 2;
        const iconY = (n.y ?? 0) - iconSize / 2;
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.drawImage(iconImg, iconX, iconY, iconSize, iconSize);
        ctx.restore();
      }

      ctx.font = `${fontSize}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = labelColor;
      const lines = label.length > 24 ? label.slice(0, 24) + "…" : label;
      ctx.fillText(lines, n.x ?? 0, (n.y ?? 0) + size + 12);
    },
    [hoverNode, iconsReady]
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
        backgroundColor={BG_SECONDARY}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => "replace"}
        nodePointerAreaPaint={nodePointerAreaPaint}
        onNodeClick={handleNodeClick}
        onNodeHover={(n) => setHoverNode(n ? String((n as Record<string, unknown>).id) : null)}
        linkColor={() => "rgba(212, 175, 55, 0.6)"}
        linkWidth={1.5}
        linkLineDash={[6, 4]}
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
