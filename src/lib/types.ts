export type DepthLevel = 1 | 2 | 3 | 4 | 5;

export const DEPTH_LABELS: Record<DepthLevel, string> = {
  1: "Familiarity",
  2: "Explanation",
  3: "Prediction",
  4: "Intervention",
  5: "Generation",
};

export type TopicStatus = "needs_review" | "developing" | "strong";

export type GapType =
  | "vocabulary_confusion"
  | "conceptual_gap"
  | "structural_gap"
  | "predictive_gap"
  | "calibration_gap"
  | "depth_gap"
  | "complex_argument"
  | "cross_domain";

export interface UserProfile {
  name?: string;
  role?: string;
  company_type?: string;
  program?: string;
  expertise_domain?: string;
  confidence_level?: string;
  goal?: string;
  gap?: string;
  curiosity_topics?: string[];
  winning_definition?: string;
  background?: string;
}

export interface User {
  id: string;
  email: string;
  created_at: string;
  profile: UserProfile | null;
}

export interface Topic {
  id: string;
  user_id: string;
  name: string;
  current_depth_level: DepthLevel;
  status: TopicStatus;
  last_tested_at: string | null;
  mental_model: string | null;
  common_errors: string[] | null;
  icon?: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  topic_id: string;
  transcript: string;
  transcript_embedding: number[] | null;
  depth_level_before: DepthLevel;
  depth_level_after: DepthLevel;
  gap_types: GapType[] | null;
  session_summary: SessionSummary | null;
  created_at: string;
}

export interface SessionSummary {
  what_covered: string[];
  what_correct: string[];
  where_broke_down: string[];
  self_test_questions: SelfTestQuestion[];
  next_session_focus: string[];
  core_concepts?: string[];
  current_level_description?: string;
  next_level_requires?: string;
}

export interface SelfTestQuestion {
  question: string;
  answer: string;
}

export interface Benchmark {
  id: string;
  topic_name: string;
  benchmark_level: DepthLevel;
  description: string;
  source_name: string;
  source_url: string;
  last_updated: string;
}

export type RoomPosition = "ahead" | "at_par" | "below";

export interface TopicWithBenchmark extends Topic {
  benchmark?: Benchmark | null;
  room_position?: RoomPosition;
}

export interface SessionAnalysis {
  depth_level_demonstrated: DepthLevel;
  gap_types_identified: GapType[];
  understanding_breakdown: string[];
  mental_model_update: string;
  session_summary: SessionSummary;
  self_test_questions: SelfTestQuestion[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
