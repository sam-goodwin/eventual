import { OpenSearchClient } from "@eventual/core-runtime";
import {
  Client,
  Connection,
  NodeOptions,
} from "@opensearch-project/opensearch";
import aws4 from "aws4";

export class AWSOpenSearchClient extends OpenSearchClient {
  constructor({
    node,
    credentials,
    region,
  }: {
    node: string | string[] | NodeOptions | NodeOptions[];
    credentials: any;
    region: string;
  }) {
    console.log("Open Search endpoint: ", node);
    super(
      new Client({
        node,
        Connection: class extends Connection {
          public buildRequestObject(params: any) {
            const request: any = super.buildRequestObject(params);
            request.service = "es";
            request.region = region;
            request.headers = request.headers || {};
            request.headers.host = request.hostname;
            return aws4.sign(request, credentials);
          }
        },
      })
    );
  }
}
