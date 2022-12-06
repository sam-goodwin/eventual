import { Logger } from "../logger.js";

export interface LoggerClient {
  getLogger(): Logger;
}
