/**
 * Strips markdown code fence wrappers from JSON text (e.g. ```json ... ```).
 */
export function stripJsonMarkdown(text: string): string {
  return text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
}
