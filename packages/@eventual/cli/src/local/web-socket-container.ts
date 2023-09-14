import type { WebSocketContainer } from "@eventual/core-runtime";
import type { SocketUrls } from "@eventual/core/internal";
import type { WebSocket } from "ws";

export class LocalWebSocketContainer implements WebSocketContainer {
  private sockets: Record<string, LocalSocket> = {};
  constructor(private domain: string) {}

  public send(
    socketName: string,
    connectionId: string,
    input: string | Buffer
  ): void {
    this.getSocket(socketName).send(connectionId, input);
  }

  public disconnect(socketName: string, connectionId: string): void {
    this.getSocket(socketName).disconnect(connectionId);
  }

  public connect(
    socketName: string,
    connectionId: string,
    webSocket: WebSocket
  ) {
    this.getSocket(socketName).connect(connectionId, webSocket);
  }

  private getSocket(socketName: string): LocalSocket {
    if (!this.sockets[socketName]) {
      this.sockets[socketName] = new LocalSocket();
    }
    return this.sockets[socketName]!;
  }

  public urls(socketName: string): SocketUrls {
    return {
      wss: `ws:/${this.domain}/__ws/${socketName}`,
      http: "unsupported",
    };
  }
}

export class LocalSocket {
  private idToSocketMap: Map<string, WebSocket> = new Map();

  public send(connectionId: string, input: string | Buffer): void {
    const ws = this.idToSocketMap.get(connectionId);
    if (!ws) {
      throw new Error(
        `Websocket for connection ${connectionId} does not exist.`
      );
    }
    ws.send(input);
  }

  public disconnect(connectionId: string): void {
    const socket = this.idToSocketMap.get(connectionId);
    if (!socket) {
      throw new Error(`No socket found for connectionId ${connectionId}`);
    }
    socket.close();
    this.idToSocketMap.delete(connectionId);
  }

  public connect(connectionId: string, webSocket: WebSocket) {
    this.idToSocketMap.set(connectionId, webSocket);
  }
}
