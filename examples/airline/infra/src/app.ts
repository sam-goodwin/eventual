import { App } from "aws-cdk-lib";
import { OperationsStack } from "./operations";
import { ReservationsStack } from "./reservations";

const app = new App();

const stages = ["dev", "prod"] as const;

for (const stage of stages) {
  new OperationsStack(app, `Operations-${stage}`, {
    stage,
  });

  new ReservationsStack(app, `Reservations-${stage}`, {
    stage,
  });
}
