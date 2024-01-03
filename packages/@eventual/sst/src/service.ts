import {
  Service as CDKService,
  type ServiceProps as CDKServiceProps,
} from "@eventual/aws-cdk";
import type { Construct } from "constructs";
import type { SSTConstruct } from "sst/constructs/Construct.js";

export type ServiceProps<Service> = CDKServiceProps<Service>;

export class Service<Service = any>
  extends CDKService<Service>
  implements SSTConstruct
{
  public readonly id: string;

  constructor(scope: Construct, id: string, props: ServiceProps<Service>) {
    super(scope, id, props);
    this.id = this.node.addr;
  }

  public getConstructMetadata() {
    return {
      type: "Service",
      data: {},
      local: {},
    };
  }

  public getFunctionBinding() {
    return {
      clientPackage: "",
      permissions: {},
      variables: {
        // TODO: what should this be?
        SERVICE_URL: {
          type: "site_url",
          value: this.gateway.apiEndpoint,
        },
      },
    } as const;
  }
}
