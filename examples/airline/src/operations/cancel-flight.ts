import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { activity, api, event, workflow } from "@eventual/core";
import { dynamo, tableName } from "../dynamodb.js";
import { FlightCancelled, FlightEventType } from "./flight-event.js";
import { CancelledFlightRecord, FlightStatus } from "./flight-record.js";

interface CancelFlightRequest {
  flightId: string;
  day: string;
  route: string;
  origin: string;
  destination: string;
  cancelledAt: string;
}

interface CancelFlightResponse {
  progressToken: string;
}

export const flightCancelled = event<FlightCancelled>(
  FlightEventType.FlightCancelled
);

api.post("/flight/:flightId/cancellation", async (request) => {
  const flightId = request.params?.flightId;
  if (!flightId) {
    return new Response("Missing Flight ID", {
      status: 400,
    });
  }
  const cancelFlight: CancelFlightRequest = await request.json();

  const { executionId } = await cancelFlightWorkflow.startExecution({
    name: flightId,
    input: cancelFlight,
  });

  return new Response(
    JSON.stringify({
      progressToken: executionId,
    } satisfies CancelFlightResponse)
  );
});

const cancelFlightWorkflow = workflow(
  "cancelFlight",
  async (request: CancelFlightRequest) => {
    const flight = await cancelFlight(request);

    await flightCancelled.publish({
      type: FlightEventType.FlightCancelled,
      cancelledAt: flight.cancelledAt,
      day: flight.day,
      destination: flight.destination,
      flightNo: flight.flightNo,
      origin: flight.origin,
      route: flight.route,
    });
  }
);

const cancelFlight = activity(
  "cancelFlight",
  async (request: CancelFlightRequest): Promise<CancelledFlightRecord> => {
    const result = await dynamo.send(
      new UpdateCommand({
        TableName: tableName,
        Key: {
          pk: request.flightId,
        },
        UpdateExpression: `SET #status = :status`,
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": FlightStatus.Cancelled,
          ":scheduled": FlightStatus.Scheduled,
        },
        ConditionExpression: `attribute_exists(pk) AND #status = :scheduled`,
      })
    );

    return result.Attributes as CancelledFlightRecord;
  }
);
