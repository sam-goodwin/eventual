import { inferFromMemory } from "@eventual/compiler";
import {
  GetBucketMetadataResponse,
  HttpMethod,
  HttpRequest,
  PresignedUrlOperation,
  PutBucketOptions,
  SocketQuery,
} from "@eventual/core";
import {
  LocalEnvironment,
  LocalPersistanceStore,
  NoPersistanceStore,
  PresignedUrlResponse,
  PresignedUrlSuccessResponse,
} from "@eventual/core-runtime";
import { ServiceSpec } from "@eventual/core/internal";
import { EventualConfig, discoverEventualConfig } from "@eventual/project";
import { exec as _exec } from "child_process";
import express, { RequestHandler, Response } from "express";
import http from "http";
import ora, { Ora } from "ora";
import path from "path";
import getBody from "raw-body";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import { WebSocketServer } from "ws";
import { Argv } from "yargs";
import { LocalWebSocketContainer } from "../local/web-socket-container.js";
import { assumeCliRole } from "../role.js";
import { setServiceOptions } from "../service-action.js";
import {
  getBuildManifest,
  getServiceData,
  getServiceSpec,
  isServiceDeployed,
  resolveRegion,
  resolveServiceFile,
  tryGetBuildManifest,
  tryResolveDefaultService,
} from "../service-data.js";

const execPromise = promisify(_exec);

export const local = (yargs: Argv) =>
  yargs.command(
    "local",
    "Local Eventual Dev Server",
    (yargs) =>
      setServiceOptions(yargs)
        .option("port", {
          alias: "p",
          describe: "Port to run the service on.",
          default: 3111,
          type: "number",
        })
        .option("maxBodySize", {
          describe: "Replace the default body size limit of 100kb.",
          default: "100kb",
          type: "string",
        })
        .option("update", {
          describe: "The update mode: first, never, always",
          choices: ["first", "never", "always"],
          default: "first",
          type: "string",
        })
        .option("offline", {
          describe:
            "Offline mode allows for local development without AWS or deployments. Environment variables from the CDK application and AWS credentials will not be set.",
          default: false,
          type: "boolean",
        })
        .option("persist", {
          describe:
            "Whether or not to persist the local environment between runs.",
          default: true,
          type: "boolean",
        })
        .option("persistLocation", {
          describe:
            "Location to load from and save to when persist is enabled. Relative paths will save to outDir/.eventual/[serviceName]/[path]. Defaults to outDir/.eventual/[serviceName]/local.",
          default: "./local",
          type: "string",
        }),
    async ({
      port: userPort,
      update,
      service,
      region,
      offline,
      maxBodySize,
      persist,
      persistLocation,
    }) => {
      const spinner = ora();
      spinner.start("Starting Local Eventual Dev Server");
      process.env.EVENTUAL_LOCAL = "1";

      const config = await discoverEventualConfig();

      if (!config) {
        spinner.fail("No eventual config (eventual.json) found...");
        process.exit(1);
      }

      const buildManifest = await resolveManifestLocal(
        spinner,
        config,
        service
      );

      if (!offline) {
        region = region ?? (await resolveRegion());

        const isDeployed = await isServiceDeployed(
          buildManifest.serviceName,
          region
        );

        if ((!isDeployed && update === "first") || update === "always") {
          spinner.text = "Deploying CDK";
          await execPromise(config.deploy);
        }

        const credentials = await assumeCliRole(
          buildManifest.serviceName,
          region
        );
        process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
        process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
        process.env.AWS_SESSION_TOKEN = credentials.sessionToken;
        const serviceData = await getServiceData(
          credentials,
          buildManifest.serviceName,
          region
        );

        if (serviceData.environmentVariables) {
          Object.entries(serviceData.environmentVariables).forEach(
            ([name, val]) => (process.env[name] = val)
          );
        }
      }

      // get from build manifest
      await import(path.resolve(buildManifest.entry));

      const port = userPort;
      const url = `http://localhost:${port}`;

      // get the stored spec file to load values from synth
      const storedServiceSpec = await getServiceSpec(
        config.outDir,
        buildManifest.serviceName
      );
      // infer from memory instead of from file to ensure the spec is up to date without synth.
      const serviceSpec: ServiceSpec = inferFromMemory(
        storedServiceSpec.openApi
      );

      const webSocketContainer = new LocalWebSocketContainer(
        `localhost:${port}`
      );

      const persistanceStore = persist
        ? new LocalPersistanceStore(
            resolveServiceFile(
              config.outDir,
              buildManifest.serviceName,
              persistLocation
            )
          )
        : new NoPersistanceStore();

      // TODO: should the loading be done by the local env?
      const localEnv = new LocalEnvironment(
        {
          serviceSpec,
          serviceUrl: url,
          serviceName: buildManifest.serviceName,
        },
        webSocketContainer,
        persistanceStore
      );

      const app = express();
      const server = http.createServer(app);

      const presignedMiddleware: RequestHandler = async (req, res, next) => {
        if (req.url.startsWith("/__bucket/presigned")) {
          const [, , , token] = req.url.split("/");
          if (!token) {
            res.status(400).send("Missing token");
            return;
          }
          if (req.method === "PUT") {
            const body = req.body
              ? JSON.stringify(req.body)
              : await getBody(req);
            const options: PutBucketOptions = {
              cacheControl: req.headers["cache-control"] as string,
              contentEncoding: req.headers["content-encoding"] as string,
              contentType: req.headers["content-type"] as string,
            };
            const result = await localEnv.executePresignedUrl(
              token,
              "put",
              options,
              body
            );
            if (handleInvalidPresignedResult(res, result)) {
              res.send(JSON.stringify(result.resp));
            }
          } else if (req.method === "GET") {
            const result = await localEnv.executePresignedUrl(token, "get");
            if (handleInvalidPresignedResult(res, result)) {
              if (!result.resp) {
                res.status(404).send();
                return;
              }
              setPredignedMetadataHeaders(res, result.key, result.resp);
              const body = await getBody(result.resp.body);
              res.send(body);
            }
          } else if (req.method === "HEAD") {
            const result = await localEnv.executePresignedUrl(token, "head");
            if (handleInvalidPresignedResult(res, result)) {
              if (!result.resp) {
                res.status(404).send();
                return;
              }
              setPredignedMetadataHeaders(res, result.key, result.resp);
              res.status(201).end();
            }
          } else if (req.method === "DELETE") {
            const result = await localEnv.executePresignedUrl(token, "delete");
            if (handleInvalidPresignedResult(res, result)) {
              res.status(200).end();
            }
          } else {
            res.status(405).send("Method not allowed");
          }
          return;
        }
        next();
      };

      const apiMiddleware: RequestHandler[] = [
        presignedMiddleware,
        express.json({ strict: false, limit: maxBodySize }),
        (req, res, next) => {
          const headers = res.getHeaders();
          if (!headers["Access-Control-Allow-Origin"]) {
            res.header(
              "Access-Control-Allow-Origin",
              req.headers.origin ?? "*"
            );
          }
          if (!headers["Access-Control-Allow-Methods"]) {
            res.header("Access-Control-Allow-Methods", "*");
          }
          if (!headers["Access-Control-Allow-Headers"]) {
            res.header("Access-Control-Allow-Headers", "*");
          }
          if (!headers["Access-Control-Allow-Credentials"]) {
            res.header("Access-Control-Allow-Credentials", "true");
          }
          next();
        },
      ];

      // open up all of the user and service commands to the service.
      app.all("/*", ...apiMiddleware, async (req, res) => {
        const request = new HttpRequest(`${url}${req.originalUrl}`, {
          method: req.method as HttpMethod,
          body: req.body ? JSON.stringify(req.body) : undefined,
          headers: req.headers as Record<string, string>,
        });
        const resp = await localEnv.invokeCommandOrApi(request);
        res.status(resp.status);
        if (resp.statusText) {
          res.statusMessage = resp.statusText;
        }
        resp.headers.forEach((value, name) => res.setHeader(name, value));
        res.send(resp.body);
      });

      const hasSockets = serviceSpec.sockets.length > 0;

      if (hasSockets) {
        const wss = new WebSocketServer({ noServer: true });

        server.on("upgrade", (request, socket, head) => {
          if (!request.url) {
            socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
            socket.destroy();
          }
          const url = new URL(request.url!, `http://${request.headers.host}`);
          if (url.pathname?.startsWith("/__ws/")) {
            const [, , socketName] = url.pathname.split("/");
            if (!socketName) {
              socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
              socket.destroy();
              return;
            }
            const query: SocketQuery = {};
            url.searchParams.forEach((value, name) => (query[name] = value));
            const headers = Object.fromEntries(
              Object.entries(request.headers).map(([name, value]) => [
                name,
                value && Array.isArray(value) ? value.join(",") : value,
              ])
            );
            const connectionId = uuidv4();
            localEnv
              .sendSocketRequest(socketName, {
                type: "connect",
                headers,
                query,
                connectionId,
              })
              .then((result) => {
                if (result) {
                  if (result.status < 200 || result.status >= 300) {
                    socket.write(
                      `HTTP/1.1 ${result.status} ${result.message}\r\n\r\n`
                    );
                    socket.destroy();
                  }
                }
                wss.handleUpgrade(request, socket, head, (ws) => {
                  wss.emit("connection", ws, request, {
                    connectionId,
                    socketName,
                  });
                });
              })
              .catch(() => {
                socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
                socket.destroy();
              });
          } else {
            socket.destroy();
          }
        });

        wss.on(
          "connection",
          (ws, _, ...args: [{ connectionId: string; socketName: string }]) => {
            const [{ connectionId, socketName }] = args;
            ws.on("message", (message) => {
              localEnv
                .sendSocketRequest(socketName, {
                  type: "message",
                  connectionId,
                  body: Array.isArray(message)
                    ? Buffer.concat(message)
                    : message instanceof ArrayBuffer
                    ? Buffer.from(message)
                    : message,
                })
                .then((res) => {
                  if (res && res.message) {
                    ws.send(res.message);
                  }
                })
                .catch((err) => {
                  console.error("Error sending socket message", err);
                });
            });
            ws.on("close", () => {
              localEnv.sendSocketRequest(socketName, {
                type: "disconnect",
                connectionId,
              });
            });
            webSocketContainer.connect(socketName, connectionId, ws);
          }
        );
      }

      server.listen(port, () => {
        process.send?.("ready");
      });

      spinner.succeed(
        `Eventual Dev Server running on ${url}. ${
          hasSockets
            ? `\n Sockets are available at: \n\t${serviceSpec.sockets
                .map(
                  (socket) =>
                    `${socket.name} - ${url.replace("http", "ws")}/__ws/${
                      socket.name
                    }`
                )
                .join("\n")}`
            : ""
        }`
      );

      let saved = false;
      const save = () => {
        if (!saved) {
          persistanceStore.save();
          saved = true;
        }
      };
      process.on("exit", () => {
        save();
      });
      process.on("SIGINT", () => {
        save();
        process.exit();
      });
      process.on("SIGTERM", () => {
        save();
        process.exit();
      });
    }
  );

/**
 * Retrieve the build manifest in a local environment.
 *
 * Does a synth if needed.
 */
export async function resolveManifestLocal(
  spinner: Ora,
  config: EventualConfig,
  service?: string
) {
  const serviceNameFirst = await tryResolveDefaultService(
    config.outDir,
    service
  );

  // if the service name is not found, try to generate one
  if (!serviceNameFirst) {
    spinner.text =
      "No service name found, running synth to try to generate one.";
    await execPromise(config.synth);
  }

  const serviceName = await tryResolveDefaultService(
    config.outDir,
    serviceNameFirst
  );

  if (!serviceName) {
    throw new Error("Service name was not found after synth.");
  }

  const manifest = await tryGetBuildManifest(config.outDir, serviceName);
  if (manifest === undefined) {
    spinner.text =
      "Service manifest not found, running synth to try to generate one.";
    await execPromise(config.synth);
    return getBuildManifest(config.outDir, serviceName);
  } else {
    return manifest;
  }
}

function setPredignedMetadataHeaders(
  res: Response,
  key: string,
  getResp: GetBucketMetadataResponse
) {
  // TODO: return they key to use as the file name?
  res.setHeader("Content-Disposition", `attachment; filename=${key}`);
  getResp.contentType &&
    res.setHeader("Content-Type", getResp.contentType ?? "binary/octet-stream");
  getResp.contentType && res.setHeader("Content-Length", getResp.contentLength);
  res.setHeader("Content-Encoding", getResp.contentEncoding ?? "identity");
  res.setHeader("Cache-Control", getResp.cacheControl ?? "no-cache");
  res.setHeader("ETag", getResp.etag);
}

function handleInvalidPresignedResult<Op extends PresignedUrlOperation>(
  res: Response,
  result: PresignedUrlResponse<Op>
): result is PresignedUrlSuccessResponse<Op> {
  if ("error" in result) {
    res.status(500).send(result.error);
    return false;
  } else if ("expired" in result) {
    res.status(400).send("Url is expired");
    return false;
  }

  return true;
}
