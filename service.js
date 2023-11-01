import axios from "axios";
import opentelemetry, { SpanStatusCode } from '@opentelemetry/api';

export const predictAge = async ({ name }) => {
    const span = opentelemetry.trace.getActiveSpan();
    span.addEvent(`${predictAge.name}`, { "name": name });

    const { data, status } = await axios.get(`https://api.agify.io?name=${name}`, {
        headers: {
            // We could look at using context or baggage API for this instead.
            "x-request-id": span.attributes["x-request-id"]
        }
    });

    if (status >= 400) {
        span.recordException({
            name: "prediction api error",
            message: "Failed to retrieve "
        });
        span.setStatus(SpanStatusCode.ERROR);
        return;
    }

    span.addEvent(`${predictAge.name}.result`, {
        "predict.name": data.name,
        "predict.age": data.age
    });

    return data.age;
};