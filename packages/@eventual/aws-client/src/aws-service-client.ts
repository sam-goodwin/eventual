import {
  HttpServiceClient,
  HttpServiceClientProps,
  mixinServiceClient,
  ServiceClient,
} from "@eventual/client";
import type { AWSHttpEventualClientProps } from "./aws-http-eventual-client.js";
import { createAwsHttpRequestSigner } from "./aws-http-request-signer.js";

export type AWSServiceClient<Service> = ServiceClient<Service>;

/**
 * AWS specific Http implementation of the {@link EventualServiceClient} to hit the API deployed
 * with an eventual service.
 *
 * Makes authorized and signed requests to API Gateway using the credentials provided on construction.
 */
export const AWSServiceClient: {
  new <Service>(props: HttpServiceClientProps): ServiceClient<Service>;
} = class AWSServiceClient extends HttpServiceClient {
  constructor(props: AWSHttpEventualClientProps) {
    super({ ...props, beforeRequest: createAwsHttpRequestSigner(props) });

    return mixinServiceClient.call(this);
  }
} as any;
