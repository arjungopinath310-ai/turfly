"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/** Round back button over a page's top photo on phones (detail screens have no tab bar). */
export function BackButton({ fallback = "/turfs" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-slate-800 shadow-md backdrop-blur sm:hidden"
      aria-label="Back"
    >
      <ArrowLeft size={20} />
    </button>
  );
}
