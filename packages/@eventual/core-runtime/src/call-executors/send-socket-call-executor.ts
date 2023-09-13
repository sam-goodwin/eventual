import type { CallOutput, SocketSendCall } from "@eventual/core/internal";
import type { CallExecutor } from "../call-executor.js";
import type { SocketClient } from "../clients/socket-client.js";

export class SocketSendCallExecutor implements CallExecutor<SocketSendCall> {
  constructor(private socketClient: SocketClient) {}
  public execute(call: SocketSendCall): Promise<CallOutput<SocketSendCall>> {
    return this.socketClient.send(call.name, call.connectionId, call.input);
  }
}
