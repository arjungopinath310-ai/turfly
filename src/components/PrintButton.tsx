"use client";
export function PrintButton() {
  return (
    <button className="btn-ghost w-full print:hidden" onClick={() => window.print()}>
      Print / save as PDF
    </button>
  );
}
