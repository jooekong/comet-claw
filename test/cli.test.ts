import { describe, test, expect } from "bun:test";
import { parseArgs } from "../src/index.js";

describe("parseArgs", () => {
  test("parses -search flag form", () => {
    const cmd = parseArgs(["-search", "hi"]);
    expect(cmd.name).toBe("search");
    expect(cmd.query).toBe("hi");
  });

  test("parses --research flag form", () => {
    const cmd = parseArgs(["--research", "quantum"]);
    expect(cmd.name).toBe("research");
    expect(cmd.query).toBe("quantum");
  });

  test("parses search command", () => {
    const cmd = parseArgs(["search", "AI trends"]);
    expect(cmd.name).toBe("search");
    expect(cmd.query).toBe("AI trends");
  });

  test("parses research command", () => {
    const cmd = parseArgs(["research", "quantum", "computing"]);
    expect(cmd.name).toBe("research");
    expect(cmd.query).toBe("quantum computing");
  });

  test("parses agent command", () => {
    const cmd = parseArgs(["agent", "go to github.com"]);
    expect(cmd.name).toBe("agent");
    expect(cmd.query).toBe("go to github.com");
  });

  test("parses status command", () => {
    const cmd = parseArgs(["status"]);
    expect(cmd.name).toBe("status");
    expect(cmd.query).toBeUndefined();
  });

  test("parses connect command", () => {
    const cmd = parseArgs(["connect"]);
    expect(cmd.name).toBe("connect");
    expect(cmd.query).toBeUndefined();
  });

  test("defaults unknown command to search with full args as query", () => {
    const cmd = parseArgs(["what is quantum computing"]);
    expect(cmd.name).toBe("search");
    expect(cmd.query).toBe("what is quantum computing");
  });

  test("joins multi-word queries", () => {
    const cmd = parseArgs(["search", "what", "is", "the", "meaning", "of", "life"]);
    expect(cmd.query).toBe("what is the meaning of life");
  });

  test("handles empty query for task commands", () => {
    const cmd = parseArgs(["search"]);
    expect(cmd.name).toBe("search");
    expect(cmd.query).toBe("");
  });
});
