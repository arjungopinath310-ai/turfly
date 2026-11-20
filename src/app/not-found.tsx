import Link from "next/link";
import { GoalIcon } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4 text-center">
      <div>
        <GoalIcon size={120} className="mx-auto" />
        <h1 className="h1 mt-4">Off target</h1>
        <p className="muted mt-2">We couldn&apos;t find that page.</p>
        <Link href="/turfs" className="btn-primary mt-6">Find a turf</Link>
      </div>
    </div>
  );
}
