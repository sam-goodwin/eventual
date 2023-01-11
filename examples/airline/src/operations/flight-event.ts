export enum FlightEventType {
  FlightAdded = "FlightAdded",
  FlightCancelled = "FlightCancelled",
}

export type FlightEvent = FlightAdded | FlightCancelled;

export interface FlightAdded {
  type: FlightEventType.FlightAdded;
  flightNo: string;
  origin: string;
  destination: string;
  aircraftType: string;
  tailNo: string;
  departureTime: string;
  arrivalTime: string;
}

export interface FlightCancelled {
  type: FlightEventType.FlightCancelled;
  flightNo: string;
  day: string;
  route: string;
  origin: string;
  destination: string;
  cancelledAt: string;
}
