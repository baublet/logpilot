import { spawn } from "node:child_process";
import chalk from "chalk";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import type { Server } from "../types";

export function runCommand(command: string[], server: Server) {
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