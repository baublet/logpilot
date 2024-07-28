import { logStore } from "./logStore";

let connectionRetryTimeout = 0;

declare var self: Worker & { location: Location };

const search = self.location.search;
const origin = self.location.origin;
const websocketUrl = (origin + "/web-socket" + search).replace(/^http/, "ws");
let socket = new WebSocket(websocketUrl);

export function getSocket() {
  return socket;
}

let timeout: undefined | NodeJS.Timeout;
function reconnectToWebsocket() {
  if (timeout !== undefined) {
    clearTimeout(timeout);
    timeout = undefined;
  }
  timeout = setTimeout(() => {
    socket = new WebSocket(websocketUrl);
  }, connectionRetryTimeout);
}

/**
 * Handles getting logs from our WebSocket into our logStore
 */
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

socket.onopen = () => {
  console.log("Connected to server");
  connectionRetryTimeout = 0;
};

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
