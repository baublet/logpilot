import AnsiConverter from "ansi-to-html";
import {
  serializeClientWorkerMessage,
  type ClientWorkerMessageTypes,
} from "./types";

let connectionRetryTimeout = 0;

declare var self: Worker & { location: Location };

const ansiConverter = new AnsiConverter({
  fg: "#f0f0f7",
  bg: "#18181b",
});

const search = self.location.search;
const origin = self.location.origin;
const websocketUrl = (origin + "/web-socket" + search).replace(/^http/, "ws");
let socket = new WebSocket(websocketUrl);

let timeout: undefined | NodeJS.Timeout
function reconnectToWebsocket() {
  if (timeout !== undefined) {
    clearTimeout(timeout);
    timeout = undefined;
  }
  timeout = setTimeout(() => {
    socket = new WebSocket(websocketUrl);
  }, connectionRetryTimeout);
}

socket.onopen = () => {
  console.log("Connected to server");
  connectionRetryTimeout = 0;
};

let logFrameLogs: string[] = [];
let writing = false;
setInterval(() => {
  if (writing || logFrameLogs.length === 0) {
    return;
  }
  const toWrite = logFrameLogs;
  logFrameLogs = [];
  writing = true;
  logStore.appendLogs(toWrite);
  writing = false;
}, 50);

socket.onmessage = (event) => {
  const parsedMessage = JSON.parse(event.data);
  if (parsedMessage.type === "log-frame") {
    logFrameLogs = parsedMessage.logs;
  }
  if (parsedMessage.type === "awaiting-log-data") {
    self.postMessage(JSON.stringify({ type: "awaiting-log-data" }));
  }
};

socket.onclose = () => {
  connectionRetryTimeout +=
    connectionRetryTimeout === 0 ? 100 : connectionRetryTimeout * 2;
  console.log(
    `Disconnected from server. Trying again in ${connectionRetryTimeout}ms`
  );
  reconnectToWebsocket();
};

socket.onerror = (error) => {
  connectionRetryTimeout +=
    connectionRetryTimeout === 0 ? 100 : connectionRetryTimeout * 2;
  console.error("Websocket error:", error);
  console.log(`Trying again in ${connectionRetryTimeout}ms`);
  reconnectToWebsocket();
};

const cancelRequestFns = new Map<string, () => void>();

// Worker communication with the main UI process
self.onmessage = (event) => {
  console.log("Worker received message: ", { event });
  const parsedMessage: ClientWorkerMessageTypes = JSON.parse(event.data);
  if (parsedMessage.type === "restart") {
    socket.send(JSON.stringify({ type: "restart" }));
  }
  if (parsedMessage.type === "stop") {
    socket.send(JSON.stringify({ type: "stop" }));
  }
  if (parsedMessage.type === "search") {
    if (parsedMessage.query === searchInstance.getQuery()) {
      return;
    }
    searchInstance.stop();
    if (parsedMessage.query) {
      searchInstance.setQuery(parsedMessage.query);
      searchInstance.start();
    }
  }

  if (parsedMessage.type === "get-filtered-lines") {
    const cleanupFn = cancelRequestFns.get(parsedMessage.query);
    cleanupFn?.();
    cancelRequestFns.delete(parsedMessage.query);
    const searchInstance = new SearchInstance({
      query: parsedMessage.query,
      startOnCreation: false,
      onResults: (results) => {
        if (results.length === 0) {
          return;
        }
        self.postMessage(
          serializeClientWorkerMessage({
            type: "filtered-lines-result",
            query: parsedMessage.query,
            results,
          })
        );
      },
    });
    searchInstance.setClientOffset(parsedMessage.clientOffset);
    searchInstance.start();
    cancelRequestFns.set(parsedMessage.query, () => {
      searchInstance.stop();
    });
  }

  if (parsedMessage.type === "get-filtered-lines-count") {
    const cleanupFn = cancelRequestFns.get("get-filtered-lines-count");
    cleanupFn?.();
    cancelRequestFns.delete("get-filtered-lines-count");
    const searchInstance = new SearchInstance({
      query: parsedMessage.query,
      startOnCreation: false,
      onResults: (results) => {
        if (results.length === 0) {
          return;
        }
        self.postMessage(
          serializeClientWorkerMessage({
            type: "filtered-lines-count-result",
            query: parsedMessage.query,
            count: results.length,
          })
        );
      },
    });
    searchInstance.setClientOffset(parsedMessage.clientOffset);
    searchInstance.start();
    cancelRequestFns.set("get-filtered-lines-count", () => {
      searchInstance.stop();
    });
  }

  if (parsedMessage.type === "remove-filter") {
    const cleanupFn = cancelRequestFns.get(parsedMessage.query);
    cleanupFn?.();
    cancelRequestFns.delete(parsedMessage.query);
  }
};

const _rawLogs: string[] = [];
const logStore = {
  getRawLogs: () => _rawLogs,
  appendLogs: (logs: string[]) => {
    _rawLogs.push(...logs);
    const htmlLogs = logs.map((log) => ansiConverter.toHtml(log || "&nbsp;"));
    self.postMessage(
      serializeClientWorkerMessage({ type: "append-logs", logs, htmlLogs })
    );
  },
};

// Classes here because these are long-running pieces of state with methods and cleanup
class SearchInstance {
  static SEARCH_BATCH_SIZE = 10000;
  protected _query: string | undefined;
  protected _queryRegex: RegExp | undefined;
  protected _timer: any;
  protected _onResults: undefined | ((results: number[]) => void);
  protected _lastSearchedIndex = 0;
  protected _clientOffset = 0;
  protected _shouldStop = false;

  constructor({
    query,
    onResults,
    startOnCreation = true,
  }: {
    query?: string;
    onResults?: (results: number[]) => void;
    startOnCreation?: boolean;
  } = {}) {
    this.setQuery(query);
    this.setOnResults(onResults);
    if (startOnCreation) {
      this.tick();
    }
  }

  public setClientOffset(clientOffset: number) {
    this._clientOffset = clientOffset - 1;
    this._lastSearchedIndex = this._clientOffset;
    this.tick();
  }

  public setQuery(query?: string) {
    if (!query) {
      this._query = undefined;
      this._queryRegex = undefined;
      return;
    }
    this._query = query;
    this._queryRegex = undefined;
    if (isRegExp(this._query)) {
      const regexPieces = this._query.split("/");
      if (regexPieces[1]) {
        this._queryRegex = new RegExp(regexPieces[1], regexPieces[2]);
      }
    }
  }

  public setOnResults(onResults?: (results: number[]) => void) {
    this._onResults = onResults;
  }

  private tick(waitMs = 1) {
    if (this._shouldStop) {
      return;
    }
    this._timer = setTimeout(() => {
      this.searchBatch();
    }, waitMs);
  }

  public stop() {
    this._shouldStop = true;
    this._lastSearchedIndex = this._clientOffset;
    if (this._timer) {
      clearTimeout(this._timer);
    }
  }

  public start() {
    this._shouldStop = false;
    this.tick();
  }

  public getQuery() {
    return this._query;
  }

  private searchBatch() {
    if (!this._query) {
      return this.tick(1000); // No query. Wait a bit and tick again
    }
    const results: number[] = [];
    let i = 1;
    for (; i < SearchInstance.SEARCH_BATCH_SIZE; i++) {
      this._lastSearchedIndex++;
      const log = _rawLogs[this._lastSearchedIndex];
      if (log === undefined) {
        this._lastSearchedIndex--;
        break;
      }
      if (this._queryRegex) {
        if (!this._queryRegex.test(log)) {
          continue;
        }
      } else if (!log.includes(this._query)) {
        continue;
      }
      results.push(this._lastSearchedIndex);
    }
    if (results.length > 0) {
      if (!this._shouldStop) {
        this._onResults?.(results);
      }
    }
    return this.tick(50); // Went through one batch of results. Surrender 50ms of clock time, then do another cycle
  }
}

function isRegExp(query: string): boolean {
  return /\/(.*)\/(.*)/.test(query);
}

const searchInstance = new SearchInstance({
  onResults: (results) => {
    self.postMessage(
      serializeClientWorkerMessage({
        type: "search-result-set",
        query: searchInstance.getQuery(),
        results,
      })
    );
  },
});
