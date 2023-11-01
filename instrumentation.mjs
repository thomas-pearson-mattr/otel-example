/*instrumentation.js*/
// Require dependencies
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { Resource } from '@opentelemetry/resources';
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";

import opentelemetry from '@opentelemetry/api';

const config = {
  service: "my-service",
  version: "1.1.1",
  namespace: "my-namespace"
};

class CommonPropagator extends SimpleSpanProcessor {
  attributes;

  constructor(attributes = {}) {
    super(new ConsoleSpanExporter());
    this.attributes = attributes;
  }

  onStart(span, parentContext) {
    super.onStart(span, parentContext);
    const parentSpan = opentelemetry.trace.getSpan(parentContext);
    const attrs = parentSpan?.attributes;

    const reqIdAttr = attrs?.["http.request.header.x_request_id"]?.[0] || attrs?.["x-request-id"];
    if(reqIdAttr) {
      // Set attribute on the child span
      span.setAttribute("x-request-id", reqIdAttr);
      parentSpan.setAttribute("x-request-id", reqIdAttr);
    }
  }

  onEnd(span, parentContext) {
    super.onEnd(span, parentContext);
  }
}

const sdk = new NodeSDK({
  serviceName: config.service,
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: config.service,
    [SemanticResourceAttributes.SERVICE_VERSION]: config.version,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: config.namespace
  }),
  traceExporter: new ConsoleSpanExporter(),
  // metricReader: new PeriodicExportingMetricReader({
  //   exporter: new ConsoleMetricExporter(),
  // }),
  instrumentations: [
    // This will automatically add bunch of instrumentation plugins based off the installed libs
    // including some common standard node libs.
    // getNodeAutoInstrumentations()

    // Otherwise you can explicity specify the instrumentation you'd like
    new HttpInstrumentation({
      serverName: config.service,
      headersToSpanAttributes: {
        client: {
          requestHeaders: [ "x-request-id" ],
          responseHeaders: [ "x-request-id" ],
        },
        server: {
          requestHeaders: [ "x-request-id" ],
          responseHeaders: [ "x-request-id" ],
        }
      }
    }),
    new ExpressInstrumentation(),
  ],
  spanProcessor: new CommonPropagator()
});

sdk.start();