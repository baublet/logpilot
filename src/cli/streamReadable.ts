import chalk from "chalk";
import type { Server } from "../types";
import { setIntervalSkippingOverlap } from "../helpers/setIntervalSkippingOverlap";
import { getInputBuffer, setInputBufferAndReturnOld } from "./getTnputBuffer";

export function streamReadable(server: Server) {
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
    const inputBuffer = getInputBuffer();
    if (inputBuffer.length === 0) {
      return;
    }
    const bufferToWrite = inputBuffer;
    setInputBufferAndReturnOld(bufferToWrite);
    bufferToWrite.forEach((buffer) => server.pushLogLine(buffer));
  }, 50);
}
