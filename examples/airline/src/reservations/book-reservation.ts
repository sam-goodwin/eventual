import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { api, event } from "@eventual/core";
import { dynamo, tableName } from "../dynamodb.js";
import { ReservationBooked, ReservationEventType } from "./booking-event.js";
import { Passenger } from "./booking-record.js";

export const reservationBooked = event<ReservationBooked>(
  ReservationEventType.ReservationBooked
);

interface BookFlightRequest {
  flightId: string;
  traveler: Passenger[];
}

api.post("/flight/:flightId/booking", async (request) => {
  const booking: BookFlightRequest = await request.json();

  await dynamo.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        pk: booking.flightId,
        ...booking,
      },
    })
  );

  // await reservationBooked.publish({
  //   type: ReservationEventType.ReservationBooked,
  //   reservationNo: ""
  // });

  return new Response();
});
