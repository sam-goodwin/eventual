import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { activity, api, event, workflow } from "@eventual/core";
import { dynamo, tableName } from "../dynamodb.js";
import { FlightAdded, FlightEventType } from "./flight-event.js";

interface AddFlightRequest {
  flightId: string;
  flightNo: string;
  origin: string;
  destination: string;
  aircraftType: string;
  tailNo: string;
  departureTime: string;
  arrivalTime: string;
}

interface AddFlightResponse {
  flightId: string;
}

export const flightAdded = event<FlightAdded>(FlightEventType.FlightAdded);

api.post("/flights", async (request) => {
  const addFlight: AddFlightRequest = await request.json();

  const { executionId } = await addFlightWorkflow.startExecution({
    // use flightNo for idempotency
    name: addFlight.flightNo,
    input: addFlight,
  });

  return new Response(
    JSON.stringify({
      flightId: executionId,
    } satisfies AddFlightResponse),
    {
      // request is accepted and is being processed
      status: 202,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
});

const addFlightWorkflow = workflow(
  "addFlight",
  async (request: AddFlightRequest) => {
    try {
      await addFlight(request);

      await flightAdded.publish({
        type: FlightEventType.FlightAdded,
        ...request,
      });
    } catch (err) {
      console.error(err);
    }
  }
);

const addFlight = activity("addFlight", async (request: AddFlightRequest) => {
  await dynamo.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        pk: request.flightId,
        ...request,
      },
      ConditionExpression: "attribute_not_exists(pk)",
    })
  );
});
