import { ChatApp } from "@/components/chat-app";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return <ChatApp email={user?.email} />;
}
