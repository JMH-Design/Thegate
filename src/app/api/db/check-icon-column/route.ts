import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/db/check-icon-column
 * Verifies whether the topics.icon column exists in the database.
 * Returns { ok: boolean, hasIconColumn: boolean, error?: string }
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("topics")
      .select("id, icon")
      .limit(1);

    if (error) {
      return Response.json({
        ok: false,
        hasIconColumn: false,
        error: error.message,
      });
    }

    return Response.json({
      ok: true,
      hasIconColumn: true,
      sample: data?.[0] ? { id: data[0].id, icon: (data[0] as { icon?: unknown }).icon } : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({
      ok: false,
      hasIconColumn: false,
      error: message,
    });
  }
}
