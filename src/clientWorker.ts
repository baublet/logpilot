import {
  serializeClientWorkerMessage,
  type ClientWorkerMessageTypes,
} from "./types";
import { SearchInstance, searchInstance } from "./clientWorker/searchInstance";
import { getSocket } from "./clientWorker/websockets";

const cancelRequestFns = new Map<string, () => void>();

// Worker communication with the main UI process
self.onmessage = (event) => {
  console.log("Worker received message: ", { event });
  const parsedMessage: ClientWorkerMessageTypes = JSON.parse(event.data);
  if (parsedMessage.type === "restart") {
    getSocket().send(JSON.stringify({ type: "restart" }));
  }
  if (parsedMessage.type === "stop") {
    getSocket().send(JSON.stringify({ type: "stop" }));
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
