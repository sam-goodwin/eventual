import type { SocketUrls, SocketUrlsProperty } from "@eventual/core/internal";
import { SocketClient } from "../clients/socket-client.js";
import type { PropertyResolver } from "../property-retriever.js";

export class SocketUrlPropertyRetriever
  implements PropertyResolver<SocketUrlsProperty>
{
  constructor(private socketClient: SocketClient) {}
  public getProperty(property: SocketUrlsProperty): SocketUrls {
    return this.socketClient.socketUrls(property.socketName);
  }
}
