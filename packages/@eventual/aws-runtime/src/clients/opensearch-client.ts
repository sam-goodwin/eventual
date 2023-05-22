import { Client, Connection } from "@opensearch-project/opensearch";
import aws4 from "aws4";

export class AWSOpenSearchClient {
  readonly client: Client;
  constructor({ credentials, region }: { credentials: any; region: string }) {
    this.client = new Client({
      Connection: class extends Connection {
        buildRequestObject(params: any) {
          const request: any = super.buildRequestObject(params);
          request.service = "es";
          request.region = region;
          request.headers = request.headers || {};
          request.headers["host"] = request.hostname;
          return aws4.sign(request, credentials);
        }
      },
    });
  }
}
