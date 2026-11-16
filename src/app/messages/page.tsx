import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ChatApp } from "@/components/ChatApp";

export default async function MessagesPage({ searchParams }: { searchParams: { c?: string } }) {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(searchParams.c ? `/messages?c=${searchParams.c}` : "/messages")}`);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4">
        <h1 className="h1">Messages</h1>
        <p className="muted">Chat directly with turfs, and turf owners with their players. Phone numbers stay private.</p>
      </div>
      <ChatApp initialId={searchParams.c ?? null} />
    </div>
  );
}
