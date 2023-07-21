import path from "path";
import { spawn } from "child_process";

const __dirname = new URL(".", import.meta.url).pathname;

const envVars = {
  EVENTUAL_DEFAULT_SERVICE: "eventual-tests",
  OUTPUTS_FILE: "cdk.out/outputs.json",
  ...process.env, // Include existing environment variables
};

const eventual = path.join(
  __dirname,
  "..",
  "node_modules",
  "@eventual",
  "cli",
  "bin",
  "eventual.mjs"
);

// Spawn a new process
const firstProcess = spawn("node", [eventual, "local"], {
  stdio: ["pipe", "pipe", "pipe", "ipc"], // Enable IPC
  env: envVars,
});

// Handler for IPC messages
firstProcess.on("message", (message) => {
  console.log(message);
  if (message === "ready") {
    // Run the second script after receiving the "ready" signal
    const secondProcess = spawn("pnpm", ["test:local"], {
      env: envVars,
    });

    secondProcess.stdout.on("data", (data) => {
      console.log(`test:local stdout: ${data}`);
    });

    secondProcess.stderr.on("data", (data) => {
      console.error(`test:local stderr: ${data}`);
    });

    secondProcess.on("close", (code) => {
      console.log(`test:local child process exited with code ${code}`);
      process.exit(code);
    });
  }
});

// If there's an error, log it
firstProcess.on("error", (err) => {
  console.error("Failed to start subprocess.", err);
});

// Log stdout data
firstProcess.stdout.on("data", (data) => {
  console.log(`eventual:local stdout: ${data}`);
});

// Log stderr data
firstProcess.stderr.on("data", (data) => {
  console.error(`eventual:local stderr: ${data}`);
});

// Exit when first process ends
firstProcess.on("close", (code) => {
  if (code !== 0) {
    console.log(`eventual:local process exited with code ${code}`);
    process.exit(code);
  }
});
