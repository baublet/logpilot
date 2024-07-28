import { ClientWorkerMessageTypes } from "../../types";
import { context } from "./context";

const workerURL = new URL(window.location.href);
workerURL.pathname = "./clientWorker.js";

export const worker = new Worker(workerURL.href);

worker.onmessage = (event) => {
  const parsed: ClientWorkerMessageTypes = JSON.parse(event.data);
  if (parsed.type === "append-logs") {
    context.appendLogs(parsed.logs, parsed.htmlLogs);
    context.setAwaitingLogLines(false);
  }
  if (parsed.type === "search-result-set") {
    context.appendSearchResults(parsed.results);
    context.setAwaitingLogLines(false);
  }
  if (parsed.type === "started") {
    context.commandStarted();
    context.setAwaitingLogLines(false);
  }
  if (parsed.type === "stopped") {
    context.commandStopped();
    context.setAwaitingLogLines(false);
  }
  if (parsed.type === "awaiting-log-data") {
    context.setAwaitingLogLines(true);
  }

  if (parsed.type === "filtered-lines-count-result") {
    context.addPreviewLineCount(parsed.count);
  }

  if (parsed.type === "filtered-lines-result") {
    context.appendFilterResults(parsed.query, parsed.results);
  }
};
