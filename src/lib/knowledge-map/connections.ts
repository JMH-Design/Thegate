import { Topic, UserProfile, TopicStatus, DepthLevel } from "@/lib/types";

export interface TopicNode {
  id: string;
  topicId: string;
  name: string;
  depth: DepthLevel;
  status: TopicStatus;
  icon?: string | null;
}

export interface ConnectionEdge {
  source: string;
  target: string;
  label?: string;
}

const MAX_EDGES_PER_WEAK_TOPIC = 4;

/**
 * Normalize text for fuzzy matching (lowercase, trim).
 */
function normalizeForMatch(text: string): string {
  return text.toLowerCase().trim();
}

/**
 * Check if a topic name matches any of the profile's gap or curiosity topics.
 * Uses substring matching: topic name contains keyword, or keyword contains topic name.
 */
function topicMatchesProfile(
  topicName: string,
  profile: UserProfile | null
): boolean {
  if (!profile) return false;

  const normalizedTopic = normalizeForMatch(topicName);
  const keywords: string[] = [];

  if (profile.gap) {
    keywords.push(...profile.gap.split(/[\s,;]+/).map(normalizeForMatch));
  }
  if (profile.curiosity_topics?.length) {
    keywords.push(...profile.curiosity_topics.map(normalizeForMatch));
  }
  if (profile.expertise_domain) {
    keywords.push(...profile.expertise_domain.split(/[\s,;]+/).map(normalizeForMatch));
  }

  for (const kw of keywords) {
    if (kw.length < 3) continue;
    if (normalizedTopic.includes(kw) || kw.includes(normalizedTopic)) {
      return true;
    }
  }
  return false;
}

/**
 * Compute nodes and cross-pollination edges for the 2D canvas.
 * Strong topics (depth 4-5) connect to weak topics (depth 1-2) where
 * the weak topic matches profile.gap or curiosity_topics.
 */
export function computeConnections(
  topics: Topic[],
  profile: UserProfile | null
): { nodes: TopicNode[]; edges: ConnectionEdge[] } {
  const nodes: TopicNode[] = topics.map((t) => ({
    id: t.id,
    topicId: t.id,
    name: t.name,
    depth: t.current_depth_level,
    status: t.status,
    icon: t.icon ?? null,
  }));

  const strongTopics = topics.filter((t) => t.current_depth_level >= 4);
  const weakTopics = topics.filter((t) => t.current_depth_level <= 2);

  const edges: ConnectionEdge[] = [];
  const edgeCountByTarget = new Map<string, number>();

  for (const weak of weakTopics) {
    const count = edgeCountByTarget.get(weak.id) ?? 0;
    if (count >= MAX_EDGES_PER_WEAK_TOPIC) continue;

    const isGapOrCuriosity = topicMatchesProfile(weak.name, profile);

    for (const strong of strongTopics) {
      if (strong.id === weak.id) continue;
      if ((edgeCountByTarget.get(weak.id) ?? 0) >= MAX_EDGES_PER_WEAK_TOPIC) break;

      const shouldConnect =
        isGapOrCuriosity ||
        topicMatchesProfile(strong.name, profile);

      if (shouldConnect) {
        edges.push({
          source: strong.id,
          target: weak.id,
          label: `Use ${strong.name} to build ${weak.name}`,
        });
        edgeCountByTarget.set(weak.id, (edgeCountByTarget.get(weak.id) ?? 0) + 1);
      }
    }
  }

  if (edges.length === 0 && strongTopics.length > 0 && weakTopics.length > 0) {
    for (const weak of weakTopics) {
      let count = 0;
      for (const strong of strongTopics) {
        if (strong.id === weak.id) continue;
        if (count >= MAX_EDGES_PER_WEAK_TOPIC) break;
        edges.push({
          source: strong.id,
          target: weak.id,
          label: `Use ${strong.name} to build ${weak.name}`,
        });
        count++;
      }
    }
  }

  return { nodes, edges };
}
