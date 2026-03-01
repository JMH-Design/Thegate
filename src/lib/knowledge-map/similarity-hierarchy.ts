import { Topic } from "@/lib/types";
import { PackNode } from "./pack-hierarchy";

/**
 * Build pack hierarchy grouped by topic similarity (cluster assignments).
 * Structure: root → cluster groups → topic nodes.
 * Fallback: if clusters empty or invalid, use single "All Topics" group.
 */
export function buildSimilarityPackHierarchy(
  topics: Topic[],
  clusterAssignments: Record<string, string[]> | null
): PackNode {
  const topicMap = new Map(topics.map((t) => [t.name.toLowerCase(), t]));

  if (!clusterAssignments || Object.keys(clusterAssignments).length === 0) {
    const children: PackNode[] = topics.map((topic) => ({
      name: topic.name,
      value: 1 + (topic.current_depth_level ?? 1),
      id: topic.id,
      topicId: topic.id,
      status: topic.status,
      depth: topic.current_depth_level,
      icon: topic.icon ?? null,
    }));
    return {
      name: "root",
      children: [{ name: "All Topics", value: children.reduce((s, t) => s + (t.value ?? 1), 0), children }],
    };
  }

  const children: PackNode[] = [];

  for (const [clusterName, topicNames] of Object.entries(clusterAssignments)) {
    const topicNodes: PackNode[] = [];

    for (const name of topicNames) {
      const topic = topicMap.get(name.toLowerCase());
      if (!topic) continue;

      const value = 1 + (topic.current_depth_level ?? 1);
      topicNodes.push({
        name: topic.name,
        value,
        id: topic.id,
        topicId: topic.id,
        status: topic.status,
        depth: topic.current_depth_level,
        icon: topic.icon ?? null,
      });
    }

    if (topicNodes.length > 0) {
      topicNodes.sort((a, b) => (b.value ?? 1) - (a.value ?? 1));
      children.push({
        name: clusterName,
        value: topicNodes.reduce((sum, t) => sum + (t.value ?? 1), 0),
        children: topicNodes,
      });
    }
  }

  const assignedTopics = new Set(
    Object.values(clusterAssignments).flat().map((n) => n.toLowerCase())
  );
  const unassigned = topics.filter(
    (t) => !assignedTopics.has(t.name.toLowerCase())
  );
  if (unassigned.length > 0) {
    const nodes: PackNode[] = unassigned.map((topic) => ({
      name: topic.name,
      value: 1 + (topic.current_depth_level ?? 1),
      id: topic.id,
      topicId: topic.id,
      status: topic.status,
      depth: topic.current_depth_level,
      icon: topic.icon ?? null,
    }));
    nodes.sort((a, b) => (b.value ?? 1) - (a.value ?? 1));
    children.push({
      name: "Other",
      value: nodes.reduce((sum, t) => sum + (t.value ?? 1), 0),
      children: nodes,
    });
  }

  if (children.length === 0) {
    return {
      name: "root",
      children: [{ name: "empty", value: 1 }],
    };
  }

  return {
    name: "root",
    children,
  };
}
