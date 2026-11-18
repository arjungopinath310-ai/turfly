import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ChatApp } from "@/components/ChatApp";
import { currentView } from "@/lib/view";

export default async function MessagesPage(props: { searchParams: Promise<{ c?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(searchParams.c ? `/messages?c=${searchParams.c}` : "/messages")}`);
  const owner = (await currentView(user.role)) === "owner";
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4">
        <h1 className="h1">Messages</h1>
        <p className="muted">{owner ? "Questions from players about your turf. Phone numbers stay private." : "Chat directly with turfs. Phone numbers stay private."}</p>
      </div>
      <ChatApp initialId={searchParams.c ?? null} owner={owner} />
    </div>
  );
}
