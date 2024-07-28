import { serializeClientWorkerMessage } from "../../types";
import { worker } from "./worker";

export const context = (() => {
  let _logs: string[] = [];
  let _htmlLogs: string[] = [];
  let _searchQuery: string | undefined = undefined;
  let _searchResults: number[] = [];
  let _commandRunning = false;
  let _awaitingLogLines = false;
  let _clientOffset = 0;
  let _previewLineCount = 0;
  let _lineCountQuery = "";

  const filters = new Map<string, Set<number>>();
  const _pushListeners: (() => void)[] = [];
  
  const context = {
    getAwaitingLogLines: () => _awaitingLogLines,
    setAwaitingLogLines: (waiting: boolean) => {
      if (_awaitingLogLines === waiting) {
        return;
      }
      _awaitingLogLines = waiting;
      _pushListeners.forEach((listener) => listener());
    },
    commandStarted: () => {
      if (_commandRunning) {
        return;
      }
      _commandRunning = true;
      _pushListeners.forEach((listener) => listener());
    },
    commandStopped: () => {
      if (!_commandRunning) {
        return;
      }
      _commandRunning = false;
      _pushListeners.forEach((listener) => listener());
    },
    restart: () => {
      worker.postMessage(
        serializeClientWorkerMessage({
          type: "restart",
        })
      );
    },
    stop: () => {
      worker.postMessage(
        serializeClientWorkerMessage({
          type: "stop",
        })
      );
    },
    enqueuePreviewLineCount: (query: string) => {
      _lineCountQuery = query;
      worker.postMessage(
        serializeClientWorkerMessage({
          type: "get-filtered-lines-count",
          query,
          clientOffset: _clientOffset,
        })
      );
      _previewLineCount = 0;
      _pushListeners.forEach((listener) => listener());
    },
    clear: () => {
      _clientOffset = _logs.length;
      _previewLineCount = 0;
      console.log({
        _lineCountQuery,
        _clientOffset,
      });
      // Re-enqueue the filter count worker thing
      worker.postMessage(
        serializeClientWorkerMessage({
          type: "get-filtered-lines-count",
          query: _lineCountQuery,
          clientOffset: _clientOffset,
        })
      );
      // Remove and re-apply all filters with the new offset
      filters.forEach((filter) => {
        filter.clear();
        worker.postMessage(
          serializeClientWorkerMessage({
            type: "get-filtered-lines",
            query: _lineCountQuery,
            clientOffset: _clientOffset,
          })
        );
      });
      _pushListeners.forEach((listener) => listener());
    },
    getPreviewLineCount: () => _previewLineCount,
    addPreviewLineCount: (count: number) => {
      _previewLineCount += count;
      _pushListeners.forEach((listener) => listener());
    },
    appendFilterResults: (query: string, results: number[]) => {
      const filter = filters.get(query);
      if (!filter) {
        return;
      }
      results.map((result) => filter.add(result));
      _pushListeners.forEach((listener) => listener());
    },
    isFilteredOut: (index: number) => {
      const filtersList = Array.from(filters.values());
      for (const filter of filtersList) {
        if (filter.has(index)) {
          return false;
        }
      }
      return true;
    },
    getFilterKnownCount: (query: string) => {
      const filterSet = filters.get(query);
      if (!filterSet) {
        return;
      }
      return filterSet.size;
    },
    addFilter: (query: string) => {
      if (filters.has(query)) {
        return;
      }
      filters.set(query, new Set());
      worker.postMessage(
        serializeClientWorkerMessage({
          type: "get-filtered-lines",
          query,
          clientOffset: _clientOffset,
        })
      );
    },
    removeFilter: (query: string) => {
      if (!filters.has(query)) {
        return;
      }
      filters.delete(query);
      worker.postMessage(
        serializeClientWorkerMessage({
          type: "remove-filter",
          query,
        })
      );
      _pushListeners.forEach((listener) => listener());
    },
    appendSearchResults: (results: number[]) => {
      _searchResults.push(...results);
      _searchResults.sort((a, b) => a - b);
      _searchResults = _searchResults.filter(
        (result, index) => _searchResults.indexOf(result) === index
      );
      _pushListeners.forEach((listener) => listener());
    },
    search: (query: string) => {
      if (query === _searchQuery) {
        return;
      }
      _searchQuery = query;
      _searchResults = [];
      worker.postMessage(
        serializeClientWorkerMessage({
          type: "search",
          query: _searchQuery,
          clientOffset: _clientOffset,
        })
      );
      _pushListeners.forEach((listener) => listener());
    },
    searchResults: () => _searchResults,
    setClientOffset: (clientOffset: number) => {
      _clientOffset = clientOffset;
    },
    getClientOffset: () => _clientOffset,
    appendLogs: (logs: string[], htmlLogs: string[]) => {
      _logs.push(...logs);
      _htmlLogs.push(...htmlLogs);
      _pushListeners.forEach((listener) => listener());
    },
    getAll: () => _logs,
    get: (index: number) => _logs[index],
    getHtml: (index: number) => _htmlLogs[index],
    count: () => _logs.length,
    subscribe: (listener: () => void) => {
      _pushListeners.push(listener);
    },
  };

  return context;
})();
