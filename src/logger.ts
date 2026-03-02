export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

const LEVEL_TAGS: Record<number, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

export class Logger {
  constructor(private level: LogLevel = LogLevel.INFO) {}

  debug(msg: string): void {
    this.log(LogLevel.DEBUG, msg);
  }

  info(msg: string): void {
    this.log(LogLevel.INFO, msg);
  }

  warn(msg: string): void {
    this.log(LogLevel.WARN, msg);
  }

  error(msg: string): void {
    this.log(LogLevel.ERROR, msg);
  }

  private log(level: LogLevel, msg: string): void {
    if (level < this.level) return;
    const tag = LEVEL_TAGS[level] ?? "LOG";
    process.stderr.write(`[comet-claw] ${tag}: ${msg}\n`);
  }
}

export const logger = new Logger(
  process.env.COMET_LOG === "debug"
    ? LogLevel.DEBUG
    : process.env.COMET_LOG === "silent"
      ? LogLevel.SILENT
      : LogLevel.INFO
);
