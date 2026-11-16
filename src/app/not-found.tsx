import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4 text-center">
      <div>
        <div className="text-6xl">🥅</div>
        <h1 className="h1 mt-4">Off target</h1>
        <p className="muted mt-2">We couldn&apos;t find that page.</p>
        <Link href="/turfs" className="btn-primary mt-6">Find a turf</Link>
      </div>
    </div>
  );
}
