import { redirect } from "next/navigation";
import { ChatApp } from "@/components/chat-app";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect("/sign-in");
  return <ChatApp email={user.email ?? "Signed in"} />;
}

