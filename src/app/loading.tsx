/** Shown instantly while a screen loads (every navigation), so taps always get feedback, like an app. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-4 px-4 py-6" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-2/3 rounded-lg bg-slate-200/80 sm:w-1/3" />
      <div className="h-11 rounded-xl bg-slate-200/70" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-8 w-20 rounded-full bg-slate-200/70" />)}
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="card flex gap-3 p-3">
          <div className="h-[72px] w-[72px] rounded-xl bg-slate-200/80" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-3/4 rounded bg-slate-200/80" />
            <div className="h-3 w-1/2 rounded bg-slate-200/70" />
            <div className="h-5 w-24 rounded-full bg-slate-200/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
