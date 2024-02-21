export default {
  // Application configuration
  env: process.env.NODE_ENV ?? "development",
  service: "otel-age-predict",
  version: "1.1.1",
  namespace: "my-namespace",
  port: parseInt(process.env.PORT || '5001'),

  // Logs & Tracing configuration
  samplePercentage: 0.4,
  defaultConsoleExporter: false,
};