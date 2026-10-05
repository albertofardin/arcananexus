import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import { POSTHOG_HOST, POSTHOG_KEY } from "../constants";

type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug";

const SEVERITY: Record<ConsoleMethod, { number: number; text: string }> = {
  debug: { number: SeverityNumber.DEBUG, text: "DEBUG" },
  log: { number: SeverityNumber.INFO, text: "INFO" },
  info: { number: SeverityNumber.INFO, text: "INFO" },
  warn: { number: SeverityNumber.WARN, text: "WARN" },
  error: { number: SeverityNumber.ERROR, text: "ERROR" },
};

function serialize(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Error) return v.stack ?? `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function buildProvider(host: string, apiKey: string) {
  const exporter = new OTLPLogExporter({
    url: `${host.replace(/\/$/, "")}/i/v1/logs`,
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  return new LoggerProvider({
    resource: resourceFromAttributes({
      "service.name": process.env.OTEL_SERVICE_NAME ?? "arcana-domine",
      "service.version": process.env.npm_package_version ?? "dev",
      "deployment.environment": process.env.NODE_ENV ?? "development",
    }),
    processors: [new BatchLogRecordProcessor(exporter)],
  });
}

function patchConsole(logger: ReturnType<LoggerProvider["getLogger"]>) {
  for (const method of Object.keys(SEVERITY) as ConsoleMethod[]) {
    const { number, text } = SEVERITY[method];
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      original(...args);
      try {
        logger.emit({
          severityNumber: number,
          severityText: text,
          body: args.map(serialize).join(" "),
        });
      } catch {
        // never let logging break the caller
      }
    };
  }
}

export async function register() {
  if (!POSTHOG_HOST || !POSTHOG_KEY) return;

  const provider = buildProvider(POSTHOG_HOST, POSTHOG_KEY);
  logs.setGlobalLoggerProvider(provider);
  patchConsole(provider.getLogger("console"));

  const shutdown = async () => {
    try {
      await provider.shutdown();
    } catch {
      // noop
    }
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
