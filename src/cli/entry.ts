import yargs from "yargs/yargs";
import type { Server } from "../types";
import { getInputMode } from "./getInputMode";
import { numberOrUndefined } from "../helpers/numberOrUndefined";
import { runCommand } from "../helpers/runCommand";
import { streamReadable } from "./streamReadable";
import { renderInterface } from "./renderInterface";

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
    .option("command", {
      alias: "c",
      type: "string",
      describe: "The command to run. If empty, will look for piped input to utilize."
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

  const command = cliArgs.command?.split(" ");

  if (command) {
    runCommand(command, server);
  } else if(getInputMode() === "pipe") {
    streamReadable(server);
  }

  await renderInterface({
    server,
    command,
    hostname,
  });

  await server.waitForClose();
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
