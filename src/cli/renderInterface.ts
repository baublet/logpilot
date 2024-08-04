import chalk from "chalk";
import type { Server } from "../types";

export async function renderInterface({
  server,
  command = [],
  hostname,
}: {
  command?: string[];
  server: Server;
  hostname: string;
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
