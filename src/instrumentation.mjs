import { api } from "@opentelemetry/sdk-node";
import {
  ParentBasedSampler,
  AlwaysOnSampler,
  TraceIdRatioBasedSampler,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { Resource } from "@opentelemetry/resources";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import config from "./config.js";

import opentelemetry from "@opentelemetry/api";

class RequestIdSpanPropagator extends BatchSpanProcessor {
  attributes;

  constructor(exporter, attributes = {}) {
    super(exporter);
    this.attributes = attributes;
  }

  /**
   * Append x-request-id to all span attributes this isn't strictly needed but it can be helpful
   * For the example where you need a to send a http client request out later you can use the span
   * as a context manager of sorts.
   *
   * @param {*} childSpan child span
   * @param {*} parentContext parent context of the child span
   */
  appendRequestId(childSpan, parentContext) {
    const parentSpan = opentelemetry.trace.getSpan(parentContext);
    const parentAttributes = parentSpan?.attributes;

    const requestId =
      parentAttributes?.["http.request.header.x_request_id"]?.[0] ||
      parentAttributes?.["x-request-id"];

    if (requestId) {
      // Set attribute on the child span
      childSpan.setAttribute("x-request-id", requestId);
      parentSpan.setAttribute("x-request-id", requestId);
    }
  }

  onStart(span, parentContext) {
    super.onStart(span, parentContext);
    this.appendRequestId(span, parentContext);
  }

  onEnd(span, parentContext) {
    super.onEnd(span, parentContext);
  }
}

const otlpTraceExporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces",
  // optional - collection of custom headers to be sent with each request, empty by default
  headers: {},
});

const tracerProvider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: config.service,
    [SemanticResourceAttributes.SERVICE_VERSION]: config.version,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: config.namespace,
  }),
  // https://opentelemetry.io/docs/concepts/sampling/
  sampler: config.env === 'development'
    ? new AlwaysOnSampler()
    : new ParentBasedSampler({
        // For production we don't really care about successful requests all the time, but we might always want this for errors
        // we could override 'TraceIdRatioBasedSampler.shouldSample' to allow this functionality 'Tail Sampling'
        root: new TraceIdRatioBasedSampler(config.samplePercentage),
      }),
});

// Add exporters
tracerProvider.addSpanProcessor(new RequestIdSpanPropagator(otlpTraceExporter));
// Only to show the open-telemetry default console format.
config.defaultConsoleExporter &&
  tracerProvider.addSpanProcessor(
    new SimpleSpanProcessor(new ConsoleSpanExporter())
  );

tracerProvider.register({
  textMapPropagator: new CompositePropagator({
    propagators: [new W3CBaggagePropagator(), new W3CTraceContextPropagator()],
  }),
});

api.trace.setGlobalTracerProvider(tracerProvider);

const allowedHttpHeaders = ["x-request-id", "x-tenant-id", "x-tenant-host"];

registerInstrumentations({
  instrumentations: [
    // Configure http auto instrumentation, by default this enables all supported instrumentors
    // Another option is to manually add them, since this is an example i'm just going to enable everything.
    // https://github.com/open-telemetry/opentelemetry-js-contrib/blob/038e0bfda951055ce91724a3b4a3042a9f918700/metapackages/auto-instrumentations-node/src/utils.ts#L86
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-http": {
        ignoreIncomingPaths: ["/healthz", "/metrics"],
        // Headers allow list
        headersToSpanAttributes: {
          client: {
            responseHeaders: allowedHttpHeaders,
          },
          server: {
            responseHeaders: allowedHttpHeaders,
            requestHeaders: allowedHttpHeaders,
          },
        },
      },
      "@opentelemetry/instrumentation-winston": {
        // disable winston logs when using otel default
        enabled: !config.defaultConsoleExporter,
        // Hook called whenever we log with winston
        logHook: (span, record) => {
          const { level, message, requestId, tenantId, error } = record;

          requestId && span.setAttribute("log.requestId", requestId);
          tenantId && span.setAttribute("log.tenantId", tenantId);

          // Skip events for trace and debug logs since they can used for trailing values
          if (["trace", "debug"].includes(level)) {
            return;
          }

          span.addEvent(message, record);

          if (level === "error") {
            span.recordException(error);
            span.setStatus(SpanStatusCode.ERROR);
          }
        },
      },
      "@opentelemetry/instrumentation-fs": {
        // Disable node:fs spans
        enabled: false,
      },
      "@opentelemetry/instrumentation-pg": {
        requireParentSpan: true,
        enhancedDatabaseReporting: true,
      },
    }),
  ],
});
