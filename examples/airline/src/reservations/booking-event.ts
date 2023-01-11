import { Reservation } from "./booking-record.js";

export enum ReservationEventType {
  ReservationBooked = "ReservationBooked",
  ReservationFlightChanged = "ReservationFlightChanged",
}

export interface ReservationBooked extends Reservation {
  type: ReservationEventType.ReservationBooked;
}
