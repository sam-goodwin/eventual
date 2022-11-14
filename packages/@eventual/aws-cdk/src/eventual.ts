import { Construct } from "constructs";
import { Api } from "./api";
import { Workflow } from "./workflow";

export interface EventualProps {
  workflows: Record<string, string>;
}

export class Eventual extends Construct {
  readonly workflows: Record<string, Workflow>;
  readonly api: Api;
  constructor(scope: Construct, id: string, props: EventualProps) {
    super(scope, id);

    this.workflows = Object.fromEntries(
      Object.entries(props.workflows).map(([id, entry]) => [
        id,
        new Workflow(this, id, { entry: entry }),
      ])
    );

    this.api = new Api(this, "api", { workflows: this.workflows });
  }
}
