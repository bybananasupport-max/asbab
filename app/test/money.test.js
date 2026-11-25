import { describe, it, expect } from "vitest";
import Money from "../www/money.js";

describe("ringgit amount detection (no AI)", () => {
  it.each([
    ["RM12.50", 12.5],
    ["rm 5", 5],
    ["RM1,250.00", 1250],
    ["RM 12", 12],
    ["MYR 3.20", 3.2],
    ["RM12.5", 12.5],
    ["Bayaran RM 45.90 kepada KEDAI ABC berjaya.", 45.9],
    ["TNG eWallet: You paid RM8.00 at Petronas", 8],
    ["Pindahan RM1,000,000.01 diterima", 1000000.01],
  ])("finds %s", (text, amount) => {
    expect(Money.firstAmount(text)).toBe(amount);
  });

  it.each([
    "tiada duit",
    "FORM12.50",           // "RM" inside a word is not a currency
    "RM",
    "nombor akaun 1234567",
    "RM12,5",              // malformed thousands
  ])("ignores %s", (text) => {
    expect(Money.firstAmount(text)).toBeNull();
  });

  it("finds every amount in order", () => {
    expect(Money.findAmounts("Beli RM3.50 dan RM 2, baki RM10.00")).toEqual([3.5, 2, 10]);
  });

  it("formats as RM with two decimals", () => {
    expect(Money.rm(7)).toBe("RM7.00");
    expect(Money.rm("12.5")).toBe("RM12.50");
  });
});
