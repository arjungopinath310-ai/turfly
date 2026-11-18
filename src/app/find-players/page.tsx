import { redirect } from "next/navigation";

/** Old address of "Join a game" (kept for links in older notifications and app builds). */
export default async function FindPlayers(props: { searchParams: Promise<{ city?: string; format?: string }> }) {
  const sp = await props.searchParams;
  const q = new URLSearchParams();
  if (sp.city) q.set("town", sp.city);
  if (sp.format) q.set("format", sp.format);
  redirect(q.size ? `/games?${q}` : "/games");
}
