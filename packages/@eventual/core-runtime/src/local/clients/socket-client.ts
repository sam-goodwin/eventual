import { type SocketUrls } from "@eventual/core/internal";
import type { SocketClient } from "../../clients/socket-client.js";
import { WebSocketContainer } from "../web-socket-container.js";

export class LocalSocketClient implements SocketClient {
  constructor(private wsContainer: WebSocketContainer) {}

  public async send(
    socketName: string,
    connectionId: string,
    input: string | Buffer
  ): Promise<void> {
    this.wsContainer.send(socketName, connectionId, input);
  }

  public async disconnect(
    socketName: string,
    connectionId: string
  ): Promise<void> {
    this.wsContainer.disconnect(socketName, connectionId);
  }

  public socketUrls(socketName: string): SocketUrls {
    return this.wsContainer.urls(socketName);
  }
}
