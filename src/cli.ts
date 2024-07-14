import yargs from "yargs/yargs";
import chalk from "chalk";
import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import type { Server } from "./types";
import { setIntervalSkippingOverlap } from "./setIntervalSkippingOverlap";

export async function main({
  getServer,
}: {
  getServer: (args: {
    defaultPort?: number;
    hostname?: string;
    port?: number;
    secret?: string;
  }) => Promise<Server>;
}) {
  const DEFAULT_PORT = 51515;
  const DEFAULT_HOST = "localhost";

  const cliArgs = await yargs(process.argv.slice(2))
    .usage("Usage: $0 [options] <command>")
    .example(
      "logpilot -p 8081 yarn develop",
      "Runs the log watcher with `yarn develop`, exposing your log service on port 8081"
    )
    .option("port", {
      alias: "p",
      describe: "Port on which to expose the log service",
      default: DEFAULT_PORT,
    })
    .option("hostname", {
      alias: ["host", "host-name", "hostName"],
      describe: "Host name at which to expose the log service",
      default: DEFAULT_HOST,
    })
    .option("dashboard", {
      alias: ["dash", "d"],
      describe:
        "Render the log dashboard. Always false if no TTY is detected. If false, will render as a standalone command.",
      type: "boolean",
      default: true,
    })
    .option("secret", {
      alias: ["s"],
      describe: "Secret token used to authenticate with the dashboard",
      type: "string",
    })
    .option("dashboardTickRate", {
      alias: ["dt"],
      describe: "Rate at which to refresh the CLI dashboard logs",
      type: "number",
      default: 1000,
    })
    .help("h")
    .alias("h", "help")
    .epilog("LogPilot: A low-friction log service for local terminal commands")
    .parse();

  const userSuppliedPort = numberOrUndefined(cliArgs.port);
  const hostname = cliArgs.hostname || DEFAULT_HOST;
  const server = await getServer({
    port: userSuppliedPort,
    defaultPort: DEFAULT_PORT,
    hostname,
    secret: cliArgs.secret,
  });

  await server.start();

  const command = cliArgs._.filter(Boolean).map((arg) => String(arg));

  if (isInputPipe(command)) {
    streamReadable(server);
  } else {
    runCommand(command, server);
  }

  renderInterface({
    server,
    command,
  });

  /**
   * ----------------------------------------------------------------------------
   */

  function runCommand(command: string[], server: Server) {
    let subProcess: ChildProcessByStdio<null, Readable, Readable> | undefined;

    function kill() {
      if (subProcess) {
        subProcess.kill();
        subProcess = undefined;
      }
    }

    server.onClientRequestStop(() => {
      kill();
    });

    server.onClientRequestRestart(() => {
      start();
    });

    async function start() {
      kill();

      server.sendStarted();
      server.pushLogLine(
        Buffer.from(
          chalk.greenBright.bold("$ ") + chalk.white.dim(command.join(" "))
        )
      );
      server.pushLogLine(
        Buffer.from(chalk.bgBlueBright.bold("~ process starting ~"))
      );

      subProcess = spawn(command[0], command.slice(1), {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      subProcess.stdout.on("data", (data) => {
        server.pushLogLine(data);
      });

      subProcess.stderr.on("data", (data) => {
        server.pushLogLine(data);
      });

      subProcess.on("exit", (code) => {
        server.sendStopped();
        server.pushLogLine(
          Buffer.from(
            chalk.bgBlueBright.bold(
              `~ process exited${code ? " with code " + code : ""} ~`
            )
          )
        );
      });
    }

    start();

    process.on("exit", kill);
    process.on("SIGINT", kill);
    process.on("SIGTERM", kill);
  }

  function numberOrUndefined(subject: unknown): number | undefined {
    if (
      typeof subject === "number" &&
      !Number.isNaN(subject) &&
      Number.isFinite(subject)
    ) {
      return subject;
    }
    if (subject === "string") {
      const parsed = parseInt(subject, 10);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  async function renderInterface({
    server,
    command,
  }: {
    command: string[];
    server: Server;
  }) {
    console.log(`
✈️  ${chalk.blueBright.bold("Log")}${chalk.magentaBright.bold("Pilot")}${
      command.length > 0 ? `< ${chalk.dim(command.join(" "))} >` : ""
    }\n   ${chalk.blue.underline(
      `http://${hostname}:${server.getPort()}?${server.processToken}`
    )}\n${chalk.dim(
      `⚠️  Logs are shown in the UI. To show them in the console, too, use -L `
    )}`);
  }
}

process.on("exit", () => {
  const terminal = process.stderr.isTTY
    ? process.stderr
    : process.stdout.isTTY
    ? process.stdout
    : undefined;
  terminal?.write("\n\n\n");
  terminal?.write("\u001B[?25h");
});

// Behavior: if you don't provide a command, assume stdin is piped
let inputMode: "pipe" | "command" = "pipe";

let inputBuffer: Buffer[] = [];
try {
  process.stdin.on("data", (input) => {
    if (inputMode === "command") {
      return;
    }
    inputBuffer.push(input);
  });
} catch (e) {
  // Some environments don't have a TTY. That's not an error
  if ((e as any)?.code !== "EINVAL") {
    throw e;
  }
}

function streamReadable(server: Server) {
  server.onClientRequestStop(() => {
    server.pushLogLine(
      Buffer.from(
        chalk.bgRedBright.bold(
          "~ unable to remotely stop a piped command ~ switch to the terminal and run `ctrl+c` to exit ~"
        )
      )
    );
  });
  server.onClientRequestRestart(() => {
    server.pushLogLine(
      Buffer.from(
        chalk.bgRedBright.bold("~ unable to remotely restart a piped command ~")
      )
    );
  });

  setIntervalSkippingOverlap(() => {
    if (inputBuffer.length === 0) {
      return;
    }
    const bufferToWrite = inputBuffer;
    inputBuffer = [];
    bufferToWrite.forEach((buffer) => server.pushLogLine(buffer));
  }, 50);
}

function isInputPipe(command: string[]): boolean {
  if (inputMode) {
    return inputMode === "pipe";
  }
  const isProbablyPiped =
    process.stdin.isTTY === undefined || inputBuffer.length > 0;
  if (!command.length && isProbablyPiped) {
    inputMode = "pipe";
    return true;
  }
  inputMode = "command";
  inputBuffer = [];
  return false;
}
