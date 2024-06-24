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
import { KafkaJsInstrumentation } from "@opentelemetry/instrumentation-kafkajs";

const otlpTraceExporter = new OTLPTraceExporter({
  url: config.tracingUrl,
  headers: {
    // "x-api-key": "blah"
  },
});

const tracerProvider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: config.service,
    [SemanticResourceAttributes.SERVICE_VERSION]: config.version,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: config.namespace,
  }),
  // https://opentelemetry.io/docs/concepts/sampling/
  sampler: config.env === "development"
    ? new AlwaysOnSampler()
    : new ParentBasedSampler({
        // For production we don't really care about successful requests all the time, but we might always want this for errors
        // we could override 'TraceIdRatioBasedSampler.shouldSample' to allow this functionality 'Tail Sampling'
        root: new TraceIdRatioBasedSampler(config.samplePercentage),
      }),
});

// Add exporters
tracerProvider.addSpanProcessor(new BatchSpanProcessor(otlpTraceExporter));

// Only to show the open-telemetry default console format.
config.defaultConsoleExporter &&
  tracerProvider.addSpanProcessor(
    new SimpleSpanProcessor(new ConsoleSpanExporter())
  );

tracerProvider.register({
  textMapPropagator: new CompositePropagator({
    // Standard to allowing context to be shared between services
    // https://www.w3.org/TR/trace-context/
    propagators: [new W3CBaggagePropagator(), new W3CTraceContextPropagator()],
  }),
});

api.trace.setGlobalTracerProvider(tracerProvider);

const allowedHttpHeaders = ["x-request-id", "x-tenant-id", "x-tenant-host"];

registerInstrumentations({
  instrumentations: [
    // Manual instrumentations
    new KafkaJsInstrumentation({
      consumerHook(span, message) {
        // Example append attributes to span
        span.setAttribute("kafka.topic", message.topic);
        span.setAttribute("requestId", message.headers?.requestId);
        span.setAttribute("tenantId", message.headers?.tenantId);
      },
      producerHook(span, message) {
        // Example
        span.setAttribute("kafka.topic", message.topic);
        span.setAttribute("requestId", message.headers?.requestId);
        span.setAttribute("tenantId", message.headers?.tenantId);
      }
    }),
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
      "@opentelemetry/instrumentation-express": {
        requestHook(span, request) {
          const requestId = request.request.header("x-request-id");
          const tenantId = request.request.header("x-tenant-id");
          // ...

          requestId && span.setAttribute("requestId", requestId);
          tenantId && span.setAttribute("tenantId", tenantId);
        },
      },
      // Automatically injects the span_id & trace_id into logs
      "@opentelemetry/instrumentation-winston": {
        // Hook called whenever we log with winston
        logHook(span, record) {
          const { level, error } = record;

          if (level === "error") {
            // Mark the span as an error & set the error detail
            span.recordException(error);
            span.setStatus(SpanStatusCode.ERROR);
          }
        },
      },
      "@opentelemetry/instrumentation-pg": {
        requireParentSpan: true,
        enhancedDatabaseReporting: true,
      },
      "@opentelemetry/instrumentation-knex": {},
      "@opentelemetry/instrumentation-redis": {},
      "@opentelemetry/instrumentation-aws-sdk": {},
      "@opentelemetry/instrumentation-fs": {
        // Disable node:fs spans
        enabled: false,
      },
      // ...
    }),
  ],
});
