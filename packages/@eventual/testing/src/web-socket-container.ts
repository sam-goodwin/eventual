import { WebSocketContainer } from "@eventual/core-runtime";
import { SocketUrls } from "@eventual/core/internal";

// TOOD: support web sockets in the test env
export class TestWebSocketContainer implements WebSocketContainer {
  public urls(_socketName: string): SocketUrls {
    throw new Error("Sockets are not supported in the Test Env.");
  }

  public send(
    _socketName: string,
    _connectionId: string,
    _input: string | Buffer
  ): void {
    throw new Error("Sockets are not supported in the Test Env.");
  }

  public disconnect(_socketName: string, _connectionId: string): void {
    throw new Error("Sockets are not supported in the Test Env.");
  }
}
