import { describe, expect, it } from "vitest";
import { formatLoc, parseLoc } from "@/lib/geo";

describe("saved location cookie", () => {
  it("rounds to about 100 m and reads back", () => {
    const v = formatLoc(11.123456, 76.987654, 1700000000000);
    expect(v).toBe("11.123,76.988,1700000000000");
    expect(parseLoc(encodeURIComponent(v))).toEqual({ lat: 11.123, lng: 76.988, at: 1700000000000 });
  });
  it("ignores junk", () => {
    expect(parseLoc(undefined)).toBeNull();
    expect(parseLoc("abc")).toBeNull();
    expect(parseLoc("95,10,1")).toBeNull();
    expect(parseLoc("11,76")).toEqual({ lat: 11, lng: 76, at: 0 });
  });
});
