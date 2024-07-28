import AnsiConverter from "ansi-to-html";

import { serializeClientWorkerMessage } from "../types";

const ansiConverter = new AnsiConverter({
  fg: "#f0f0f7",
  bg: "#18181b",
});

const _rawLogs: string[] = [];
export const logStore = {
  getRawLogs: () => _rawLogs,
  appendLogs: (logs: string[]) => {
    _rawLogs.push(...logs);
    const htmlLogs = logs.map((log) => ansiConverter.toHtml(log || "&nbsp;"));
    self.postMessage(
      serializeClientWorkerMessage({ type: "append-logs", logs, htmlLogs })
    );
  },
};
