import { describe, it, expect } from "vitest";
import Ai from "../www/ai.js";

describe("AI providers (phase 5.1)", () => {
  it("defaults: Gemini for chat and coding, personal data off, Claude keeps old settings", () => {
    const c = Ai.config({ modelLight: "claude-haiku-x", modelHeavy: "claude-sonnet-x", aiDailyCap: 30 });
    expect(c.roles).toEqual({ chat: "gemini", coding: "gemini" });
    expect(c.order).toEqual(["gemini", "claude", "openai"]);
    expect(c.providers.claude).toMatchObject({ chatModel: "claude-haiku-x", codingModel: "claude-sonnet-x", cap: 30 });
    expect(c.providers.gemini).toMatchObject({ on: true, cap: 20, personal: false });
    expect(Object.values(c.providers).every((p) => p.personal === false)).toBe(true);
  });

  it("fallback order: role first, then Amin's order; skips off, no key, over cap", () => {
    const s = { ai: { roles: { chat: "claude", coding: "openai" }, order: ["openai", "gemini", "claude"],
      providers: { gemini: { cap: 2 }, claude: { cap: 5 }, openai: { on: false } } } };
    const keys = { gemini: true, claude: true, openai: true };
    expect(Ai.chain(s, "chat", { keys })).toEqual(["claude", "gemini"]);
    expect(Ai.chain(s, "chat", { keys, used: { gemini: 2 } })).toEqual(["claude"]);
    expect(Ai.chain(s, "chat", { keys: { gemini: true } })).toEqual(["gemini"]);
    expect(Ai.chain(s, "coding", { keys })).toEqual(["gemini", "claude"]);
    expect(Ai.chain({ ...s, aiEnabled: false }, "chat", { keys })).toEqual([]);
  });

  it("personal notifications only go to providers that allow it (default: none)", () => {
    const keys = { gemini: true, claude: true };
    expect(Ai.chain({}, "chat", { keys, personal: true })).toEqual([]);
    expect(Ai.chain({ ai: { providers: { claude: { personal: true } } } }, "chat", { keys, personal: true })).toEqual(["claude"]);
  });

  it("is ready only with a provider switched on and a key", () => {
    expect(Ai.ready({}, {})).toBe(false);
    expect(Ai.ready({}, { openai: true })).toBe(true);
    expect(Ai.ready({ ai: { providers: { openai: { on: false } } } }, { openai: true })).toBe(false);
    expect(Ai.ready({ aiEnabled: false }, { gemini: true })).toBe(false);
  });

  it("labels each answer with the AI that wrote it", () => {
    expect(Ai.label({ provider: "gemini" })).toBe("otak kedua: Gemini");
    expect(Ai.label({ provider: "openai", fallback: true })).toBe("otak kedua: OpenAI (sandaran)");
    expect(Ai.label({})).toBe("otak kedua: Claude"); // answers saved before Phase 5.1
  });

  it("keeps the same ids as the Kotlin providers", () => {
    expect(Ai.IDS).toEqual(["gemini", "claude", "openai"]);
  });
});

describe("chat room AI choice", () => {
  it("puts the room's provider first, Auto keeps the role", () => {
    const keys = { gemini: true, claude: true, openai: true };
    expect(Ai.chain({}, "chat", { keys, prefer: "openai" })).toEqual(["openai", "gemini", "claude"]);
    expect(Ai.chain({}, "chat", { keys, prefer: "auto" })).toEqual(["gemini", "claude", "openai"]);
    expect(Ai.active({ ai: { providers: { claude: { on: false } } } }, keys)).toEqual(["gemini", "openai"]);
  });
});

describe("attachments (Phase 6.2)", () => {
  it("only providers that read every attachment, and says which one was skipped", () => {
    const keys = { gemini: true, claude: true, openai: true };
    expect(Ai.chainFor({}, "chat", { keys, prefer: "claude" }, ["video"])).toEqual({ ids: ["gemini"], switchedFrom: "claude" });
    expect(Ai.chainFor({}, "chat", { keys, prefer: "openai" }, ["image", "pdf"]).ids[0]).toBe("openai");
    expect(Ai.chainFor({}, "chat", { keys: { claude: true } }, ["video"])).toEqual({ ids: [], switchedFrom: "claude" });
    expect(Ai.kindOf("application/pdf")).toBe("pdf");
  });
});
