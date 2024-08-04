import path from "path";
import getPort from "get-port";
import crypto from "crypto";
import http from "http";
import { WebSocketServer, type WebSocket } from "ws";
import express from "express";
import fs from "fs";

import type { Server, WebSocketMessageTypes } from "./types";
import { main } from "./cli/entry";

const MAX_LOGS_TO_SEND_IN_SINGLE_MESSAGE = 1000;
const LOG_BATCH_TICK_TIME = 100; // How fast we send messages through websockets

// When we compile this down to a single file, we replace the lines below with
// the contents of the files in `dist`
const GLOBAL_DIST_REPLACEMENTS = {
  "ui.js": "",
  "clientWorker.js": "",
  "index.html": "",
};

const uiJsContent = () =>
  GLOBAL_DIST_REPLACEMENTS["ui.js"] ||
  fs.readFileSync(path.join(__dirname, "..", "dist", "ui.js")).toString();

const clientWorkerJsContent = () =>
  GLOBAL_DIST_REPLACEMENTS["clientWorker.js"] ||
  fs
    .readFileSync(path.join(__dirname, "..", "dist", "clientWorker.js"))
    .toString();

const indexHtmlContent = () =>
  GLOBAL_DIST_REPLACEMENTS["index.html"] ||
  fs.readFileSync(path.join(__dirname, "..", "dist", "index.html")).toString();

const websocketPool = (() => {
  const pool = new Set<WebSocket>();
  const cursorPositions = new WeakMap<WebSocket, number>();
  return {
    count: () => {
      return pool.size;
    },
    add: (websocket: WebSocket) => {
      pool.add(websocket);
      cursorPositions.set(websocket, 0);
    },
    remove: (websocket: WebSocket) => {
      return pool.delete(websocket);
    },
    each: (callback: (websocket: WebSocket) => void) => {
      return pool.forEach((websocket) => callback(websocket));
    },
    getCursorPosition: (websocket: WebSocket) => {
      return cursorPositions.get(websocket) || 0;
    },
    setCursorPosition: (websocket: WebSocket, cursorPosition: number) => {
      cursorPositions.set(websocket, cursorPosition);
    },
  };
})();

async function getNodeServer({
  userSuppliedPort,
  defaultPort,
  hostname,
  secret,
}: {
  userSuppliedPort?: number;
  defaultPort?: number;
  hostname?: string;
  secret?: string;
}): Promise<Server> {
  const port = userSuppliedPort || (await getPort({ port: defaultPort }));
  const decoder = new TextDecoder();
  const processToken = secret || (await getSecureRandomString());
  const logLines: string[] = [];

  let latestCursorPosition = 0;

  let pushing = false;
  function maybePushLogs() {
    if (pushing || logLines.length === 0 || !websocketPool.count()) {
      return;
    }
    pushing = true;
    websocketPool.each((websocket) => {
      const clientCursorPosition = websocketPool.getCursorPosition(websocket);
      if (!websocketPool.count() || logLines.length === 0) {
        return;
      }
      const toSend = logLines.slice(
        clientCursorPosition,
        clientCursorPosition + MAX_LOGS_TO_SEND_IN_SINGLE_MESSAGE
      );
      if (toSend.length === 0) {
        return;
      }
      websocketPool.setCursorPosition(
        websocket,
        clientCursorPosition + toSend.length
      );
      websocket.send(
        JSON.stringify({
          type: "log-frame",
          logs: toSend,
          cursor: clientCursorPosition,
        })
      );
    });
    pushing = false;
  }

  setInterval(() => {
    maybePushLogs();
  }, LOG_BATCH_TICK_TIME);

  let _clientRequestsStopHandler: undefined | (() => void) = undefined;
  let _clientRequestsStartHandler: undefined | (() => void) = undefined;

  const app = express();

  app.get("/ui.js", (_, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "no-cache");
    res.send(uiJsContent());
  });

  app.get("/clientWorker.js", (_, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "no-cache");
    res.send(clientWorkerJsContent());
  });

  app.use((req, res) => {
    const url = req.url;

    if (!url.includes("?" + processToken)) {
      res.status(403).send("Forbidden");
      return;
    }

    if (url.includes("&keepAlive")) {
      return res.status(200).send("");
    }

    res.setHeader("Content-Type", "text/html");
    res.setHeader("Cache-Control", "no-cache");
    res.send(indexHtmlContent());

    return;
  });

  const server = http.createServer(app);
  const websocketServer = new WebSocketServer({
    noServer: true,
  });

  server.on("upgrade", (request, socket, head) => {
    const url = request.url;
    if (!url?.includes("?" + processToken)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (ws) => {
      websocketServer.emit("connection", ws, request);
    });
  });

  websocketServer.on("connection", (websocket) => {
    websocket.on("error", (error) => {
      console.error("⛔  WebSocket error:\n\n", error);
    });

    websocket.on("message", (message) => {
      const data: WebSocketMessageTypes = JSON.parse(String(message));
      if (data.type === "stop") {
        _clientRequestsStopHandler?.();
      }
      if (data.type === "restart") {
        _clientRequestsStartHandler?.();
      }
    });

    websocket.on("close", function () {
      websocketPool.remove(websocket);
      console.log("🌑  Client disconnected. Total: " + websocketPool.count());
    });

    websocketPool.add(websocket);
    console.log("🌕  Client connected. Total: " + websocketPool.count());
    if (logLines.length > 0) {
      websocket.send(
        JSON.stringify({
          type: "awaiting-log-data",
        })
      );
    }
    maybePushLogs();
  });

  function pushLogLine(data: Uint8Array | Buffer) {
    const decodedLogText = decoder.decode(data);
    const logTextWithoutTrailingCarriageReturn = decodedLogText.replace(
      /\r?\n$/,
      ""
    );
    const lines = logTextWithoutTrailingCarriageReturn.split(/\r?\n/);
    logLines.push(...lines);
    latestCursorPosition += lines.length;
  }

  let _exited = false;
  let _resolve: undefined | ((value: void | PromiseLike<void>) => void);
  const promiseThatResolvesOnClose = new Promise<void>((resolve) => {
    _resolve = resolve;
  });

  function onExit(code: undefined | number | null | string) {
    if (_exited || typeof code !== "number") {
      return;
    }
    _exited = true;
    console.log("📕  Server exiting", code);
    server.close();
    _resolve?.();
    process.exit(code);
  }

  process.on("SIGINT", onExit);
  process.on("SIGTERM", onExit);

  return {
    processToken,
    start: () => {
      return new Promise<void>((resolve) => {
        server.listen(port, hostname, undefined, () => {
          resolve();
        });
      });
    },
    stop: () => {
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
    pushLogLine,
    onExit,
    getLastNLogs: (count: number) => {
      return logLines.slice(-count);
    },
    getLogCount: () => {
      return logLines.length.toLocaleString();
    },
    getPort: () => {
      return port;
    },
    onClientRequestStop: (callback: typeof _clientRequestsStopHandler) => {
      _clientRequestsStopHandler = callback;
    },
    onClientRequestRestart: (callback: typeof _clientRequestsStartHandler) => {
      _clientRequestsStartHandler = callback;
    },
    sendStarted: () => {
      websocketPool.each((websocket) =>
        websocket.send(JSON.stringify({ type: "started" }))
      );
    },
    sendStopped: () => {
      websocketPool.each((websocket) =>
        websocket.send(JSON.stringify({ type: "stopped" }))
      );
    },
    getClientCount: () => {
      return websocketPool.count();
    },
    waitForClose: () => {
      return promiseThatResolvesOnClose;
    },
  };
}

function getSecureRandomString() {
  return new Promise<string>((resolve, reject) => {
    crypto.randomBytes(48, (err, buffer) => {
      if (err) {
        reject(err);
      } else {
        resolve(buffer.toString("hex").slice(0, 24));
      }
    });
  });
}

main({ getServer: getNodeServer })
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
