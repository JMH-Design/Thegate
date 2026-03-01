export function buildAnalysisPrompt(
  topicName: string,
  transcript: string,
  previousLevel: number
): string {
  return `You are analyzing a coaching session transcript for The Gate, a Socratic learning platform.

Topic: ${topicName}
Previous depth level: ${previousLevel}

Transcript:
---
${transcript}
---

Analyze this session carefully and return ONLY valid JSON (no markdown, no explanation) with this exact structure:

{
  "depth_level_demonstrated": <number 1-5>,
  "gap_types_identified": [<array of strings from: "vocabulary_confusion", "conceptual_gap", "structural_gap", "predictive_gap", "calibration_gap", "depth_gap", "complex_argument", "cross_domain">],
  "understanding_breakdown": [<array of strings describing where understanding failed>],
  "mental_model_update": "<a coherent 1-3 sentence summary of the user's current understanding of the topic, in language the user demonstrated>",
  "session_summary": {
    "what_covered": [<array of specific concepts or skills addressed>],
    "what_correct": [<array of things the user demonstrated solid understanding of>],
    "where_broke_down": [<array of specific points where understanding failed or was incomplete>],
    "self_test_questions": [
      {"question": "<question>", "answer": "<answer>"},
      {"question": "<question>", "answer": "<answer>"},
      {"question": "<question>", "answer": "<answer>"}
    ],
    "next_session_focus": [<array of recommended focus areas for the next session>],
    "core_concepts": [<2-4 key ideas as memorable, testable statements - not vague summaries>],
    "current_level_description": "<where the user is now: 'You are at Level X on [topic].'>",
    "next_level_requires": "<what Level X+1 would require: specific capability or knowledge>"
  }
}

Rules for depth level assignment:
- Level 1 (Familiarity): User can describe the topic but not explain why it works
- Level 2 (Explanation): User can explain mechanisms but not predict outcomes of changes
- Level 3 (Prediction): User can predict what happens when conditions change
- Level 4 (Intervention): User can diagnose and fix problems in the system
- Level 5 (Generation): User can create novel applications or solutions using the knowledge

Assign the level that the user DEMONSTRATED through their responses — not what the coach told them, not what they claimed, but what they showed they could do independently. Be rigorous. If there's doubt, assign the lower level.

The depth level can go DOWN from the previous level if the user showed regression or failed to demonstrate the previous level on re-test.`;
}
