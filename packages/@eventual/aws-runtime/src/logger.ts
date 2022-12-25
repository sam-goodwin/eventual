import { injectLambdaContext, Logger } from "@aws-lambda-powertools/logger";
import errorLogger from "@middy/error-logger";

export const logger = new Logger({ serviceName: "eventual" });

export const loggerMiddlewares = [
  injectLambdaContext(logger, { clearState: true }),
  // Try to pull out the specific execution's logger from the error. This usually won't be necessary,
  // as lambdas that operate on a single execution can attach execution id to the global logger
  errorLogger({
    logger: (e) => {
      logger.error("Execution error", e);
    },
  }),
];
