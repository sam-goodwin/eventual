import { Socket } from "@eventual/core";
import { SocketMethod, SocketUrls } from "@eventual/core/internal";

export type SocketClient = {
  [K in keyof Pick<Socket, SocketMethod>]: (
    socketName: string,
    ...args: Parameters<Socket[K]>
  ) => ReturnType<Socket[K]>;
} & {
  socketUrls(socketName: string): SocketUrls;
};
