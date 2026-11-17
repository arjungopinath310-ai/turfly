import { cookies } from "next/headers";
import { resolveView, VIEW_COOKIE, type View } from "./access";

/** The side (player / owner) the signed-in user is using, for server components. See resolveView. */
export async function currentView(role: string | null | undefined): Promise<View> {
  return resolveView(role, (await cookies()).get(VIEW_COOKIE)?.value);
}
