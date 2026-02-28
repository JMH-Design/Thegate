import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { KnowledgeMap } from "@/components/knowledge-map/knowledge-map";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: userData } = await supabase
    .from("users")
    .select("profile")
    .eq("id", user.id)
    .single();

  const { data: topics } = await supabase
    .from("topics")
    .select("*")
    .eq("user_id", user.id)
    .order("last_tested_at", { ascending: false, nullsFirst: false });

  const { data: benchmarks } = await supabase
    .from("benchmarks")
    .select("*");

  return (
    <KnowledgeMap
      profile={userData?.profile}
      topics={topics || []}
      benchmarks={benchmarks || []}
      userEmail={user.email || ""}
    />
  );
}
