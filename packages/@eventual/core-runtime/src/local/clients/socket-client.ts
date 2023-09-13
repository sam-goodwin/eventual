import type { SocketUrls } from "@eventual/core/internal";
import type { SocketClient } from "../../clients/socket-client.js";

export class LocalSocketClient implements SocketClient {
  public send(
    _socketName: string,
    _connectionId: string,
    _input: string | Buffer
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  public socketUrls(_socketName: string): SocketUrls {
    throw new Error("Method not implemented.");
  }
}
