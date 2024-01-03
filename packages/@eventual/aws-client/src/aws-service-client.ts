import {
  HttpEventualClient,
  HttpServiceClient,
  HttpServiceClientProps,
  proxyServiceClient,
  ServiceClient,
} from "@eventual/client";
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
  public readonly httpClient: HttpServiceClient;
  // @ts-ignore
  public readonly httpEventualClient: HttpEventualClient;
  constructor(props: AWSHttpEventualClientProps) {
    const signer = createAwsHttpRequestSigner(props);
    this.httpClient = new HttpServiceClient({
      serviceUrl: props.serviceUrl,
      beforeRequest: signer,
    });
    // this.httpEventualClient = new HttpEventualClient({
    //   serviceUrl: props.serviceUrl,
    //   beforeRequest: signer,
    // });

    return proxyServiceClient.call(this);
  }
} as any;
