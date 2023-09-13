import { SocketUrls } from "@eventual/core/internal";

export interface SocketClient {
  send(
    socketName: string,
    connectionId: string,
    input: Buffer | string
  ): Promise<void>;
  socketUrls(socketName: string): SocketUrls;
}
