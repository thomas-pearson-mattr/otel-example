# Open-telemetry example

```bash
yarn start
```

Predict someones age from their name 🔮, and take a look at the logs 🪵

You will see the `x-request-id` is propagated through each span's attributes & you'll get an understanding how logs or "Events" are attached to each Span.

```bash
export NAME="thomas"
curl http://localhost:8080/predict\?name\=$NAME -H "x-request-id: 12343" | jq
```