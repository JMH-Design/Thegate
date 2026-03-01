"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import * as d3 from "d3";
import { buildPackHierarchy, PackNode } from "@/lib/knowledge-map/pack-hierarchy";
import {
  getIconImage,
  getCachedIconImage,
} from "@/lib/knowledge-map/icon-cache";
import { Topic, UserProfile } from "@/lib/types";

interface PackMapProps {
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
      return {
        fill: "rgba(34, 197, 94, 0.15)",
        stroke: SUCCESS,
        labelColor: SUCCESS,
      };
    case "needs_review":
      return {
        fill: "rgba(245, 158, 11, 0.15)",
        stroke: AMBER,
        labelColor: AMBER,
      };
    default:
      return {
        fill: "rgba(212, 175, 55, 0.12)",
        stroke: GOLD,
        labelColor: TEXT_PRIMARY,
      };
  }
}

type View = [number, number, number];

type PackedNode = d3.HierarchyCircularNode<PackNode>;

function isLeaf(node: PackedNode): boolean {
  return !node.children || node.children.length === 0;
}

export function PackMap({
  topics,
  profile,
  width: widthProp,
  height: heightProp,
}: PackMapProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [iconsReady, setIconsReady] = useState(false);
  const [focusNode, setFocusNode] = useState<PackedNode | null>(null);
  const [view, setView] = useState<View | null>(null);
  const transitionRef = useRef<number | null>(null);

  const hierarchyData = useMemo(() => buildPackHierarchy(topics), [topics]);

  const { root, nodes } = useMemo(() => {
    const hierarchy = d3
      .hierarchy(hierarchyData)
      .sum((d) => (d as PackNode).value ?? 1)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const pack = d3
      .pack<PackNode>()
      .size([dimensions.width, dimensions.height])
      .padding(3);

    const packed = pack(hierarchy);
    const allNodes: PackedNode[] = [];
    packed.each((node) => {
      allNodes.push(node);
    });

    return { root: packed, nodes: allNodes };
  }, [hierarchyData, dimensions]);

  const initialView = useMemo((): View => {
    return [root.x, root.y, root.r * 2];
  }, [root.x, root.y, root.r]);

  useEffect(() => {
    const iconNames = [
      ...new Set(
        nodes
          .filter((n) => n.data.topicId)
          .map((n) =>
            n.data.icon && n.data.icon.trim() ? n.data.icon : "BookMarked"
          )
      ),
    ];
    Promise.all(iconNames.map((name) => getIconImage(name))).then(() => {
      setIconsReady(true);
    });
  }, [nodes]);

  useEffect(() => {
    if (widthProp != null && heightProp != null) {
      setDimensions({ width: widthProp, height: heightProp });
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
  }, [widthProp, heightProp]);

  const currentView = view ?? initialView;
  const k = dimensions.width / currentView[2];

  const zoomTo = useCallback(
    (v: View) => {
      setView(v);
    },
    []
  );

  const zoom = useCallback(
    (target: PackedNode) => {
      const targetView: View = [target.x, target.y, target.r * 2];
      const startView = view ?? initialView;

      if (transitionRef.current) {
        cancelAnimationFrame(transitionRef.current);
      }

      const start = performance.now();
      const duration = 750;

      const animate = (now: number) => {
        const elapsed = now - start;
        const t = Math.min(elapsed / duration, 1);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        const interp = d3.interpolateZoom(startView, targetView);
        zoomTo(interp(eased));

        if (t < 1) {
          transitionRef.current = requestAnimationFrame(animate);
        } else {
          transitionRef.current = null;
          setFocusNode(target);
        }
      };

      transitionRef.current = requestAnimationFrame(animate);
    },
    [view, initialView, zoomTo]
  );

  const zoomOut = useCallback(() => {
    if (!focusNode || !focusNode.parent) return;

    const target = focusNode.parent;
    const targetView: View = [target.x, target.y, target.r * 2];
    const startView = view ?? initialView;

    if (transitionRef.current) {
      cancelAnimationFrame(transitionRef.current);
    }

    const start = performance.now();
    const duration = 750;

    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const interp = d3.interpolateZoom(startView, targetView);
      zoomTo(interp(eased));

      if (t < 1) {
        transitionRef.current = requestAnimationFrame(animate);
      } else {
        transitionRef.current = null;
        setFocusNode(target.parent ? target : null);
      }
    };

    transitionRef.current = requestAnimationFrame(animate);
  }, [focusNode, view, initialView, zoomTo]);

  const handleNodeClick = useCallback(
    (node: PackedNode, event: React.MouseEvent) => {
      event.stopPropagation();
      if (isLeaf(node) && node.data.topicId) {
        router.push(`/session/${node.data.topicId}`);
      } else {
        zoom(node);
      }
    },
    [router, zoom]
  );

  const handleBackgroundClick = useCallback(() => {
    zoomOut();
  }, [zoomOut]);

  if (topics.length === 0) return null;

  const nodeId = (n: PackedNode) =>
    n.data.topicId ?? n.data.name ?? `node-${n.x}-${n.y}`;

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[400px] w-full rounded-[--radius-card] border border-border overflow-hidden bg-bg-secondary"
    >
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ display: "block" }}
        onClick={handleBackgroundClick}
      >
        <rect
          width={dimensions.width}
          height={dimensions.height}
          fill="transparent"
          style={{ cursor: focusNode ? "pointer" : "default" }}
        />
        {nodes
          .filter((n) => n.depth > 0)
          .map((node) => {
            const id = nodeId(node);
            const leaf = isLeaf(node);
            const status = node.data.status ?? "developing";
            const styles = getNodeStyles(status);
            const isHover = hoverNode === id;
            const fillColor = isHover ? SURFACE_HOVER : styles.fill;
            const strokeColor = isHover ? GOLD_FOCUS : styles.stroke;
            const labelColor = isHover ? GOLD_FOCUS : styles.labelColor;
            const showLabel = node.r * k > 20;
            const iconImg = leaf ? getCachedIconImage(node.data.icon) : null;
            const tx = (node.x - currentView[0]) * k + dimensions.width / 2;
            const ty = (node.y - currentView[1]) * k + dimensions.height / 2;
            const r = node.r * k;

            return (
              <g
                key={id}
                transform={`translate(${tx},${ty})`}
                onClick={(e) => handleNodeClick(node, e)}
                onMouseEnter={() => setHoverNode(id)}
                onMouseLeave={() => setHoverNode(null)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  r={r}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={isHover ? 2.5 : 1.5}
                />
                {leaf && iconImg?.complete && iconImg.src && (
                  <image
                    href={iconImg.src}
                    x={-r * 0.5}
                    y={-r * 0.5}
                    width={r}
                    height={r}
                    style={{ opacity: 0.95 }}
                  />
                )}
                {showLabel && (
                  <text
                    y={r + 12}
                    textAnchor="middle"
                    fill={labelColor}
                    fontSize={12}
                    fontFamily="Inter, -apple-system, BlinkMacSystemFont, sans-serif"
                  >
                    {(node.data.name?.length ?? 0) > 24
                      ? `${node.data.name?.slice(0, 24)}…`
                      : node.data.name}
                  </text>
                )}
              </g>
                );
              })}
      </svg>
      {focusNode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            zoomOut();
          }}
          className="absolute bottom-4 right-4 rounded-[--radius-button] border border-border bg-surface px-3 py-2 text-sm text-text-primary hover:bg-surface-hover transition-colors"
          aria-label="Zoom out"
        >
          Reset view
        </button>
      )}
    </div>
  );
}
