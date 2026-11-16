import { describe, expect, it } from "vitest";
import { msg91Text, renderSms, SMS_TEMPLATES, smsAmount, smsKeyFor, smsValue, smsVars, smsWhen } from "@/lib/notifications/sms";
import { istToUtc } from "@/lib/time";

const D = "2026-11-17"; // Tuesday
const b = {
  code: "TF-QZM8TJ",
  startAt: istToUtc(D, 20 * 60),
  endAt: istToUtc(D, 21 * 60),
  onlineAmount: 4900,
  balanceDue: 95100,
  turf: { name: "Kickoff Fives – Manjeri’s “Best” Ground, Calicut Road" },
};
const ascii = /^[\x20-\x7E]*$/;

describe("DLT SMS templates", () => {
  // longest realistic value per variable: 30-char turf name, "Wed 30 Sep, 11:00 AM-12:00 PM", "1,00,000"…
  const maxLen = (desc: string) =>
    /amount/.test(desc) ? 8 : /turf/.test(desc) ? 30 : /date/.test(desc) ? 29 : /booking/.test(desc) ? 9 : /code/.test(desc) ? 6 : 10;

  it("templates are plain ASCII and fit one SMS (160 chars) with the longest realistic values", () => {
    for (const t of SMS_TEMPLATES) {
      expect(t.text, t.key).toMatch(ascii);
      const longest = renderSms(t.key, t.vars.map((d) => "X".repeat(maxLen(d))));
      expect(longest.length, t.key).toBeLessThanOrEqual(160);
      expect(t.text.match(/\{#var#\}/g)!.length, t.key).toBe(t.vars.length);
      expect(t.example.length, t.key).toBe(t.vars.length);
    }
  });

  it("fills booking messages with short ASCII values (max 30 characters each)", () => {
    for (const job of ["BOOKING_CONFIRMED", "REMINDER_24H", "REMINDER_2H", "BALANCE_PENDING"]) {
      const vars = smsVars(job, b, istToUtc("2026-11-16", 20 * 60));
      for (const v of vars) {
        expect(v.length).toBeLessThanOrEqual(30);
        expect(v).toMatch(ascii);
      }
      expect(renderSms(smsKeyFor(job)!, vars)).toMatch(ascii);
    }
    expect(renderSms("BOOKING_CONFIRMED", smsVars("BOOKING_CONFIRMED", b))).toBe(
      "Booking TF-QZM8TJ confirmed: Kickoff Fives - Manjeri's \"Be., Tue 17 Nov, 8:00-9:00 PM. Paid Rs.49 online, Rs.951 due at turf. - Turfly",
    );
  });

  it("says today / tomorrow / in 2 hours", () => {
    expect(smsVars("REMINDER_24H", b, istToUtc("2026-11-16", 20 * 60))[1]).toBe("tomorrow");
    expect(smsVars("REMINDER_24H", b, istToUtc(D, 9 * 60))[1]).toBe("today");
    expect(smsVars("REMINDER_2H", b, istToUtc(D, 18 * 60))[1]).toBe("in 2 hours");
  });

  it("formats amounts and times for SMS", () => {
    expect(smsAmount(145100)).toBe("1,451");
    expect(smsAmount(2450)).toBe("24.50");
    expect(smsWhen(istToUtc(D, 11 * 60), istToUtc(D, 12 * 60))).toBe("Tue 17 Nov, 11:00 AM-12:00 PM");
    expect(smsValue("  a b  ")).toBe("a b");
  });

  it("maps jobs to templates and builds MSG91 template text", () => {
    expect(smsKeyFor("REMINDER_2H")).toBe("REMINDER");
    expect(smsKeyFor("SOMETHING_ELSE")).toBeNull();
    expect(msg91Text(SMS_TEMPLATES[0])).toBe("##OTP## is your Turfly login OTP. It is valid for 5 minutes. Do not share it with anyone. - Turfly");
    expect(msg91Text(SMS_TEMPLATES[1])).toBe("Booking ##var1## confirmed: ##var2##, ##var3##. Paid Rs.##var4## online, Rs.##var5## due at turf. - Turfly");
  });
});
