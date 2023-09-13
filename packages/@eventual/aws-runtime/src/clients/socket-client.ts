import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { LazyValue, SocketClient, getLazy } from "@eventual/core-runtime";
import type { SocketUrls } from "@eventual/core/internal";

export type SocketEndpoints = Record<string, SocketUrls>;

export interface AWSSocketClientProps {
  apiGatewayManagementClientFactory: (
    socketUrl: string
  ) => ApiGatewayManagementApiClient;
  socketUrls: LazyValue<SocketEndpoints>;
}

export class AWSSocketClient implements SocketClient {
  constructor(private props: AWSSocketClientProps) {}

  public async send(
    socketName: string,
    connectionId: string,
    input: string | Buffer
  ): Promise<void> {
    const client = this.props.apiGatewayManagementClientFactory(
      this.socketUrls(socketName).http
    );

    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(input),
      })
    );
  }

  public socketUrls(socketName: string): SocketUrls {
    const endpoints = getLazy(this.props.socketUrls)[socketName];
    if (!endpoints) {
      throw new Error(`No service url provided for socket ${socketName}`);
    }
    return endpoints;
  }
}
