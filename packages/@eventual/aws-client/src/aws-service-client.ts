import {
  HttpServiceClient,
  HttpServiceClientProps,
  proxyServiceClient,
  ServiceClient,
} from "@eventual/client";
import { EVENTUAL_DEFAULT_COMMAND_NAMESPACE } from "@eventual/core/internal";
import type { AWSHttpEventualClientProps } from "./aws-http-eventual-client.js";
import { createAwsHttpRequestSigner } from "./aws-http-request-signer.js";

export type AWSServiceClient<Service> = ServiceClient<Service>;

/**
 * AWS specific Http implementation of the {@link EventualServiceClient} to execute requests
 * to the Commands within a Service.
 *
 * Makes authorized and signed requests to API Gateway using the credentials provided on construction.
 */
export const AWSServiceClient: {
  new <Service>(props: HttpServiceClientProps): ServiceClient<Service>;
} = class AWSServiceClient {
  public httpClient: HttpServiceClient;
  constructor(props: AWSHttpEventualClientProps) {
    this.httpClient = new HttpServiceClient({
      serviceUrl: props.serviceUrl,
      beforeRequest: createAwsHttpRequestSigner(props),
    });

    return proxyServiceClient.call(this, EVENTUAL_DEFAULT_COMMAND_NAMESPACE);
  }
} as any;
