import ms from "ms";

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { activity, Signal, workflow } from "@eventual/core";
import { dynamo, tableName } from "../dynamodb.js";
import { flightCancelled } from "../operations/cancel-flight.js";
import { FlightCancelled } from "../operations/flight-event.js";
import {
  FlightBookings,
  isGoldPassenger,
  isNoStatusPassenger,
  isSilverPassenger,
  Passenger,
} from "./booking-record.js";

flightCancelled.on(async (event) => {
  await rebookFlight.startExecution({
    name: event.flightNo, // only ever start one rebook workflow for a flightNo
    input: event,
  });
});

const rebookFlight = workflow(
  "RebookFlight",
  async (event: FlightCancelled) => {
    const passengers = await getPassengers(event.flightNo);

    const goldStatus = passengers.filter(isGoldPassenger);
    const silverStatus = passengers.filter(isSilverPassenger);
    const noStatus = passengers.filter(isNoStatusPassenger);

    // gold > silver > no status

    await rebookPassengers(goldStatus);
    await rebookPassengers(silverStatus);
    await rebookPassengers(noStatus);
  }
);

const getPassengers = activity(
  "GetPassengers",
  async (flightNo: string): Promise<Passenger[]> => {
    const flight = (
      await dynamo.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            pk: flightNo,
          },
        })
      )
    ).Item as FlightBookings | undefined;

    if (flight === undefined) {
      throw new Error(`flight ${flightNo} does not exist`);
    }

    return flight.passengers;
  }
);

const rebookPassengers = workflow(
  "RebookPassengers",
  async (passengers: Passenger[]) => {
    await Promise.allSettled(passengers.map(rebookPassenger));
  }
);

const confirmRebooking = new Signal<boolean>("ConfirmRebooking");

const rebookPassenger = workflow(
  "RebookPassenger",
  async (passenger: Passenger) => {
    const flightNo = await findFlight({
      destination: "TODO",
      origin: "TODO",
    });

    await offerFlight({
      email: passenger.email,
      flightNo,
    });

    try {
      await confirmRebooking.expect({
        timeoutSeconds: ms("1 hour") / 1000,
      });
    } catch {
      // passenger did not rebook within an hour, move them to deferred booking
      // this will give passengers waiting on this passenger a change to rebook
      await deferRebooking.startExecution({
        input: passenger,
      });
      // they have not confirmed the booking in the alloted time
    }
  }
);

const initiateRebooking = new Signal("InitiateRebooking");

const deferRebooking = workflow("DeferRebooking", async (_input: Passenger) => {
  await initiateRebooking.expect();

  // proceed to rebook
});

const offerFlight = activity(
  "OfferFlight",
  async (_input: { email: string; flightNo: string }) => {
    // send email with
  }
);

const findFlight = activity(
  "FindFlight",
  async (_input: { origin: string; destination: string }) => {
    return "TODO";
  }
);
