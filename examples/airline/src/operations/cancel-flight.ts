import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, tableName } from "../dynamodb.js";
import { FlightCancelled, FlightEventType } from "./flight-event.js";
import { CancelledFlightRecord, FlightStatus } from "./flight-record.js";
import { activity, api, event } from "@eventual/core";

interface CancelFlightRequest {
  flightId: string;
  day: string;
  route: string;
  origin: string;
  destination: string;
  cancelledAt: string;
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
  const payload: CancelFlightRequest = await request.json();

  const flight = await cancelFlight(payload);

  await flightCancelled.publish({
    type: FlightEventType.FlightCancelled,
    cancelledAt: flight.cancelledAt,
    day: flight.day,
    destination: flight.destination,
    flightNo: flight.flightNo,
    origin: flight.origin,
    route: flight.route,
  });

  return new Response(JSON.stringify(flight));
});

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
