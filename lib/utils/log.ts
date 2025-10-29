export type LogLevel = "info" | "warn" | "error" | "done";

export interface LogLine {
  level: LogLevel;
  message: string;
}

export class LogSink {
  private logs: LogLine[] = [];
  private encoder = new TextEncoder();
  private controller?: ReadableStreamDefaultController<Uint8Array>;

  setController(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller;
  }

  log(level: LogLevel, message: string) {
    const logLine: LogLine = { level, message };
    this.logs.push(logLine);
    
    console.log(`[${level.toUpperCase()}] ${message}`);
    
    if (this.controller) {
      const data = JSON.stringify(logLine) + '\n';
      this.controller.enqueue(this.encoder.encode(data));
    }
  }

  info(message: string) {
    this.log("info", message);
  }

  warn(message: string) {
    this.log("warn", message);
  }

  error(message: string) {
    this.log("error", message);
  }

  done(message: string) {
    this.log("done", message);
  }

  getLogs(): LogLine[] {
    return this.logs;
  }
}

