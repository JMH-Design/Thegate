import { Topic, TopicStatus, DepthLevel, STATUS_LABELS } from "@/lib/types";

export interface PackNode {
  name: string;
  value?: number;
  id?: string;
  topicId?: string;
  status?: TopicStatus;
  depth?: DepthLevel;
  icon?: string | null;
  children?: PackNode[];
}

const STATUS_ORDER: TopicStatus[] = ["strong", "developing", "needs_review"];

export function buildPackHierarchy(topics: Topic[]): PackNode {
  const groups = new Map<TopicStatus, PackNode[]>();

  for (const status of STATUS_ORDER) {
    groups.set(status, []);
  }

  for (const topic of topics) {
    const value = 1 + (topic.current_depth_level ?? 1);
    groups.get(topic.status)!.push({
      name: topic.name,
      value,
      id: topic.id,
      topicId: topic.id,
      status: topic.status,
      depth: topic.current_depth_level,
      icon: topic.icon ?? null,
    });
  }

  const children: PackNode[] = [];

  for (const status of STATUS_ORDER) {
    const topicsInGroup = groups.get(status)!;
    if (topicsInGroup.length > 0) {
      topicsInGroup.sort((a, b) => (b.value ?? 1) - (a.value ?? 1));
      children.push({
        name: STATUS_LABELS[status],
        status,
        value: topicsInGroup.reduce((sum, t) => sum + (t.value ?? 1), 0),
        children: topicsInGroup,
      });
    }
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
