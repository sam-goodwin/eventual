export enum FlightStatus {
  Cancelled = "Cancelled",
  Landed = "Landed",
  Scheduled = "Scheduled",
}

export interface FlightRecord {
  pk: string;
  status: FlightStatus;

  flightId: string;
  flightNo: string;
  day: string;
  route: string;
  origin: string;
  destination: string;
  cancelledAt?: string;
}

export interface CancelledFlightRecord extends FlightRecord {
  status: FlightStatus.Cancelled;
  cancelledAt: string;
}
