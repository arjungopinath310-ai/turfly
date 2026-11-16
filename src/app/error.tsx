"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4 text-center">
      <div>
        <h1 className="h1">Something went wrong</h1>
        <p className="muted mt-2">{error.message.includes("Please sign in") ? "Please sign in to continue." : "Please try again."}</p>
        <button className="btn-primary mt-6" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
