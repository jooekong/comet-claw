import { describe, test, expect, spyOn } from "bun:test";
import { Logger, LogLevel } from "../src/logger.js";

describe("Logger", () => {
  function captureStderr(fn: () => void): string[] {
    const writes: string[] = [];
    const spy = spyOn(process.stderr, "write").mockImplementation((s: any) => {
      writes.push(s);
      return true;
    });
    fn();
    spy.mockRestore();
    return writes;
  }

  test("outputs debug message at debug level", () => {
    const logger = new Logger(LogLevel.DEBUG);
    const writes = captureStderr(() => logger.debug("test debug"));
    expect(writes.join("")).toContain("test debug");
  });

  test("suppresses debug message at info level", () => {
    const logger = new Logger(LogLevel.INFO);
    const writes = captureStderr(() => logger.debug("hidden"));
    expect(writes.join("")).not.toContain("hidden");
  });

  test("outputs warn at info level", () => {
    const logger = new Logger(LogLevel.INFO);
    const writes = captureStderr(() => logger.warn("caution"));
    expect(writes.join("")).toContain("caution");
  });

  test("outputs error at all levels", () => {
    const logger = new Logger(LogLevel.ERROR);
    const writes = captureStderr(() => logger.error("failure"));
    expect(writes.join("")).toContain("failure");
  });

  test("silent level suppresses everything", () => {
    const logger = new Logger(LogLevel.SILENT);
    const writes = captureStderr(() => {
      logger.debug("a");
      logger.info("b");
      logger.warn("c");
      logger.error("d");
    });
    expect(writes).toEqual([]);
  });

  test("prefixes output with [comet-claw]", () => {
    const logger = new Logger(LogLevel.INFO);
    const writes = captureStderr(() => logger.info("hello"));
    expect(writes.join("")).toContain("[comet-claw]");
  });

  test("includes level tag in output", () => {
    const logger = new Logger(LogLevel.DEBUG);
    const writes = captureStderr(() => logger.warn("w"));
    expect(writes.join("")).toContain("WARN");
  });
});
