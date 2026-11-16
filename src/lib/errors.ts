import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public status: number, message: string, public code = "ERROR") {
    super(message);
  }
}
export class SlotConflictError extends AppError {
  constructor() {
    super(409, "Sorry — that slot was just taken. Please pick another time.", "SLOT_TAKEN");
  }
}

/** Postgres exclusion_violation (23P01) on our occupancy constraint. */
export function isExclusionViolation(e: unknown): boolean {
  const any = e as { code?: string; meta?: { code?: string }; message?: string };
  return (
    any?.meta?.code === "23P01" ||
    any?.code === "23P01" ||
    String(any?.message ?? "").includes("occupancy_no_overlap") ||
    String(any?.message ?? "").includes("23P01")
  );
}

/** Wraps a route handler: awaits Next 15's async params and turns domain errors into JSON responses. */
export function handle(fn: (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await fn(req, { params: (await ctx?.params) ?? {} });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid input", code: "INVALID" }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: "Something went wrong", code: "INTERNAL" }, { status: 500 });
}
