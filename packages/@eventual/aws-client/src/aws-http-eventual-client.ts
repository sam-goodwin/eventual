import { SignatureV4Init } from "@aws-sdk/signature-v4";
import {
  BeforeRequest,
  HttpEventualClient,
  HttpServiceClientProps,
} from "@eventual/client";
import { createAwsHttpRequestSigner } from "./aws-http-request-signer.js";

export interface AWSHttpEventualClientProps extends HttpServiceClientProps {
  credentials?: SignatureV4Init["credentials"];
  region?: string;
  /**
   * Optional hook to mutate the request before the request is signed.
   *
   * `beforeRequest` is invoked after signing the request and may invalidate the signature.
   */
  beforeRequestSigning?: BeforeRequest;
}

/**
 * AWS specific Http implementation of the {@link EventualServiceClient} to hit the API deployed
 * with an eventual service.
 *
 * Makes authorized and signed requests to API Gateway using the credentials provided on construction.
 */
export class AWSHttpEventualClient extends HttpEventualClient {
  constructor(props: AWSHttpEventualClientProps) {
    super({ ...props, beforeRequest: createAwsHttpRequestSigner(props) });
  }
}
