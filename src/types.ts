export type WebSocketMessageTypes =
  | { type: "restart" }
  | { type: "started" }
  | { type: "stop" }
  | { type: "stopped" }
  | { type: "awaiting-log-data" }
  | { type: "log-frame"; logs: string; cursor: number }
  | {
      type: "last-cursor";
      cursor: number;
    };

export type ClientWorkerMessageTypes =
  | { type: "search"; query: string; clientOffset?: number }
  | { type: "search-result-set"; query?: string; results: number[] }
  | { type: "restart" }
  | { type: "started" }
  | { type: "stop" }
  | { type: "stopped" }
  | { type: "awaiting-log-data" }
  | { type: "append-logs"; logs: string[]; htmlLogs: string[] }
  | {
      type: "get-filtered-lines-count";
      query: string;
      clientOffset: number;
    }
  | {
      type: "get-filtered-lines";
      query: string;
      clientOffset: number;
    }
  | { type: "filtered-lines-result"; query: string; results: number[] }
  | { type: "filtered-lines-count-result"; query: string; count: number }
  | { type: "remove-filter"; query: string };

export function serializeClientWorkerMessage<
  T extends ClientWorkerMessageTypes,
>(message: T): string {
  return JSON.stringify(message);
}

export interface Server {
  processToken: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  pushLogLine: (data: Uint8Array | Buffer) => void;
  onExit: (code: undefined | number) => void;
  getPort: () => number;
  onClientRequestStop: (fn: () => void) => void;
  onClientRequestRestart: (fn: () => void) => void;
  sendStopped: () => void;
  sendStarted: () => void;
  getLastNLogs: (count: number) => string[];
  getLogCount: () => string;
  getClientCount: () => number;
}
