import { SocketUrls } from "@eventual/core/internal";

export interface WebSocketContainer {
  send(socketName: string, connectionId: string, input: string | Buffer): void;
  disconnect(socketName: string, connectionId: string): void;
  urls(socketName: string): SocketUrls;
}
