export interface FlightBookings {
  flightNo: string;
  passengers: Passenger[];
}

export interface Reservation {
  reservationNo: string;
  flights: BookedFlight[];
  passenger: Passenger;
}

export interface BookedFlight {
  day: string;
  flightNo: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
}

export enum LoyaltyStatus {
  Gold = "Gold",
  Silver = "Silver",
}

export interface Passenger {
  email: string;
  firstName: string;
  lastName: string;
  dob: string;
  loyaltyId: string;
  loyaltyStatus?: LoyaltyStatus;
}

export function isGoldPassenger(p: Passenger) {
  return p.loyaltyStatus === LoyaltyStatus.Gold;
}

export function isSilverPassenger(p: Passenger) {
  return p.loyaltyStatus === LoyaltyStatus.Silver;
}

export function isNoStatusPassenger(p: Passenger) {
  return p.loyaltyStatus === undefined;
}
