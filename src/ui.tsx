import React from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import AutoSizer from "react-virtualized-auto-sizer";
import { createRoot } from "react-dom/client";
import {
  serializeClientWorkerMessage,
  type ClientWorkerMessageTypes,
} from "./types";

const workerURL = new URL(window.location.href);
workerURL.pathname = "./clientWorker.js";
const worker = new Worker(workerURL.href);

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(<App />);

function App() {
  const [, _setRenderSeed] = React.useState(false);
  const rerender = React.useCallback(() => {
    _setRenderSeed((s) => !s);
  }, []);
  const logCount = context.count();

  const [isOnline, setIsOnline] = React.useState(true);
  React.useEffect(() => {
    window.addEventListener("online", () => {
      setIsOnline(true);
    });
    window.addEventListener("offline", () => {
      setIsOnline(false);
    });
    const interval = setInterval(() => {
      // ping the server at url&keepAlive
      fetch(window.location.href + "&keepAlive")
        .then((result) => {
          if (result.status !== 200) {
            return setIsOnline(false);
          }
          setIsOnline(true);
        })
        .catch(() => {
          setIsOnline(false);
        });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    let animationFrame: number = 0;
    context.subscribe(() => {
      if (animationFrame) {
        return;
      }
      animationFrame = requestAnimationFrame(() => {
        rerender();
        animationFrame = 0;
      }); // Update throttle
    });
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  const handleStop = React.useCallback(() => {
    context.stop();
  }, []);
  const handleRestart = React.useCallback(() => {
    context.restart();
  }, []);
  const handleClear = React.useCallback(() => {
    context.clear();
  }, []);
  const [searchTerm, setSearchTerm] = React.useState("");

  const virtuoso = React.useRef<VirtuosoHandle>(null);
  const [highlightedIndex, setHighlightedIndex] = React.useState<
    number | undefined
  >(undefined);
  const scrollToIndex = React.useCallback((index: number) => {
    debouncedScrollToIndex({
      index,
      scrollToIndex: (i) =>
        virtuoso.current?.scrollIntoView({ index: i, align: "center" }),
    });
  }, []);
  const highlightPrevious = React.useCallback(() => {
    setHighlightedIndex((highlightedIndex) => {
      const searchResults = context.searchResults();
      if (highlightedIndex === undefined) {
        const lastElement = searchResults.length - 1;
        if (searchResults[lastElement] !== undefined) {
          scrollToIndex(searchResults[lastElement]);
        }
        return searchResults[lastElement];
      }
      // Scroll backwards through the search results (which are sorted) until we find a result
      // smaller than the currently-highlighted index. That's the previous result. If we get
      // to the beginning, we return the last result.
      for (let i = searchResults.length - 1; i >= 0; i--) {
        if (searchResults[i] < highlightedIndex) {
          scrollToIndex(searchResults[i]);
          return searchResults[i];
        }
      }
      const lastElement = searchResults[searchResults.length - 1];
      if (lastElement === undefined) {
        return undefined;
      }
      scrollToIndex(lastElement);
      return lastElement;
    });
  }, []);
  const highlightNext = React.useCallback(() => {
    setHighlightedIndex((highlightedIndex) => {
      const searchResults = context.searchResults();
      if (highlightedIndex === undefined) {
        if (searchResults[0] !== undefined) {
          scrollToIndex(searchResults[0]);
        }
        return searchResults[0];
      }
      // Scroll through the search results (which are sorted) until we find a result bigger
      // than the currently-highlighted index. That's the next result. If we get to the end,
      // we return the first result.
      for (let i = 0; i < searchResults.length; i++) {
        if (searchResults[i] > highlightedIndex) {
          console.log(
            "While looping, we found a search result higher than highlighted. Going to it ",
            { i, searchResults, highlightedIndex }
          );
          scrollToIndex(searchResults[i]);
          return searchResults[i];
        }
      }
      const firstElement = searchResults[0];
      if (firstElement === undefined) {
        return undefined;
      }
      scrollToIndex(firstElement);
      return firstElement;
    });
  }, []);

  React.useEffect(() => {
    setHighlightedIndex(undefined);
  }, [searchTerm]);

  const getSearchResultsString = React.useCallback(() => {
    const searchResults = context.searchResults();
    if (highlightedIndex === undefined) {
      return `${searchResults.length} results`;
    }

    // If the highlighted index isn't in the search results (e.g., user clicked)
    if (!searchResults.includes(highlightedIndex)) {
      return `${searchResults.length} results`;
    }

    // If the highlighted index is in the search results
    return `${searchResults.indexOf(highlightedIndex) + 1}/${
      searchResults.length
    } results`;
  }, [context.searchResults(), highlightedIndex]);

  let searchTermTimerRef = React.useRef<Timer>();
  const handleSearchTermChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (searchTermTimerRef.current) {
        clearTimeout(searchTermTimerRef.current);
      }
      searchTermTimerRef.current = setTimeout(() => {
        context.search(e.target.value);
      }, 100);
      setSearchTerm(e.target.value);
      return () => {
        if (searchTermTimerRef.current) {
          clearTimeout(searchTermTimerRef.current);
        }
      };
    },
    []
  );

  const [dialogOpen, setDialogOpen] = React.useState(true);

  const filterInputRef = React.useRef<HTMLInputElement>(null);
  const filterTermTimerRef = React.useRef<Timer>();
  const handleFilterOnChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (filterTermTimerRef.current) {
        clearTimeout(filterTermTimerRef.current);
      }
      if (!filterInputRef.current?.value) {
        return;
      }
      filterTermTimerRef.current = setTimeout(() => {
        context.enqueuePreviewLineCount(e.target.value);
      }, 100);
      return () => {
        if (filterTermTimerRef.current) {
          clearTimeout(filterTermTimerRef.current);
        }
      };
    },
    []
  );
  const handleToggleFilterDialog = React.useCallback(
    () => setDialogOpen((open) => !open),
    []
  );
  const [appliedFilters, setAppliedFilters] = React.useState<string[]>([]);
  const filtersApplied = appliedFilters.length > 0;
  const handleAddFilter = React.useCallback(() => {
    const filterText = filterInputRef.current?.value;
    if (!filterText) {
      return;
    }
    if (appliedFilters.includes(filterText)) {
      return;
    }
    setAppliedFilters((appliedFilters) => [...appliedFilters, filterText]);
    context.addFilter(filterText);
    filterInputRef.current.value = "";
  }, []);
  const handleRemoveFilter = React.useCallback((filter: string) => {
    setAppliedFilters((appliedFilters) =>
      appliedFilters.filter((f) => f !== filter)
    );
    context.removeFilter(filter);
  }, []);

  return (
    <div className="max-h-full max-w-full w-full h-full overflow-hidden flex flex-col relative">
      <div className="flex justify-between gap-2 p-2 bg-zinc-950 items-center z-50">
        <h1 className="font-bold">
          <span className="pr-2">✈️</span>
          <span className="text-sky-500">Log</span>
          <span className="text-fuchsia-500">Pilot</span>
        </h1>
        <div className="flex gap-2 items-center">
          <div>
            <Button onClick={handleToggleFilterDialog}>
              <span>Filters: 0</span>
            </Button>
            <dialog
              className="absolute right-6 top-12 max-w-full max-h-full bg-transparent"
              open={dialogOpen}
            >
              <div className="flex items-center justify-center rounded bg-zinc-950 bg-opacity-90 text-zinc-50 z-10 overflow-y-auto">
                <div className="flex flex-col gap-12 w-80 max-w-full p-4">
                  <button
                    className="absolute right-0 top-0 rounded-full w-6 h-6 flex justify-center items-center hover:bg-sky-500 border hover:border-transparent border-sky-500 bg-transparent text-sky-500 hover:text-zinc-50"
                    onClick={handleToggleFilterDialog}
                  >
                    <span
                      className="font-bold"
                      style={{ lineHeight: 0, transform: "translateY(-1px)" }}
                    >
                      ×
                    </span>
                  </button>
                  <div className="flex flex-col gap-4">
                    <h1 className=" text-zinc-50 z-10 text-3xl font-thin">
                      Log Filters
                    </h1>
                    <div className="flex flex-col gap-2">
                      <div className="bg-zinc-50 text-zinc-800 rounded-lg p-2 flex gap-2">
                        <input
                          type="text"
                          autoFocus={true}
                          className="p-2 w-full text-2xl bg-zinc-50 flex-grow"
                          onChange={handleFilterOnChange}
                          ref={filterInputRef}
                        />
                        <button onClick={handleAddFilter}>➕</button>
                      </div>
                      {filterInputRef.current?.value && (
                        <div className="text-xs text-zinc-500">
                          <span>matches:</span>{" "}
                          {context.getPreviewLineCount() || ""}
                        </div>
                      )}
                      {appliedFilters.map((filter) => (
                        <div key={filter}>
                          {filter} ({context.getFilterKnownCount(filter)}){" "}
                          <button onClick={() => handleRemoveFilter(filter)}>
                            ✖️
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs">
                    Filters allow you pass in a string or a{" "}
                    <code className="text-zinc-400">
                      /regular.*expression/ig
                    </code>{" "}
                    pattern to filter logs. Searches and the log viewer will
                    only show logs <span className="font-bold">matching</span>{" "}
                    the string or expression.
                  </div>
                </div>
              </div>
            </dialog>
          </div>
          <div className="relative max-w-full w-96">
            <Input
              type="text"
              placeholder='Search term, e.g., "error" or "/^regexp/ig" for a regular expression'
              name="search"
              title="Search"
              onChange={handleSearchTermChange}
            />
            {searchTerm.trim() === "" ? null : (
              <div className="absolute bg-zinc-800 flex gap-2 rounded top-full left-0 right-0 items-center">
                <Button onClick={highlightPrevious}>«</Button>
                <div className="flex-grow text-zinc-300 text-xs text-center">
                  {getSearchResultsString()}
                </div>
                <Button onClick={highlightNext}>»</Button>
              </div>
            )}
          </div>
          <GhostButton onClick={handleStop} title="Stop" disabled={!isOnline}>
            🛑 Stop
          </GhostButton>
          <GhostButton
            onClick={handleRestart}
            title="Restart"
            disabled={!isOnline}
          >
            🔃 Restart
          </GhostButton>
          <GhostButton onClick={handleClear} title="Clear">
            📺 Clear
          </GhostButton>
        </div>
      </div>
      {!isOnline && (
        <div
          className="absolute justify-center items-center bg-amber-800 gap-2 flex flex-col z-50 p-2 rounded rounded-t-none select-none"
          style={{
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <div className="text-xl text-center">⚠️</div>
          <div className="text-sm font-bold">server is off</div>
        </div>
      )}
      <div className="max-h-full max-w-full overflow-y-auto flex-grow relative monospace">
        {logCount === 0 && context.getAwaitingLogLines() ? (
          <b>Awaiting log lines...</b>
        ) : (
          <AutoSizer>
            {({ height, width }) => {
              return (
                <Virtuoso
                  style={{ height: `${height}px`, width: `${width}px` }}
                  totalCount={
                    logCount - context.getClientOffset() < 0
                      ? 0
                      : logCount - context.getClientOffset()
                  }
                  ref={virtuoso}
                  followOutput={"auto"}
                  itemContent={(index) => {
                    const isFilteredOut =
                      filtersApplied && context.isFilteredOut(index);
                    return (
                      <div
                        style={{ minHeight: "1px" }}
                        className={
                          "px-2 text-wrap break-words flex gap-2 items-center group " +
                          getClassName({
                            index,
                            highlightedItemIndex: highlightedIndex,
                            isFilteredOut,
                          })
                        }
                        onClick={() =>
                          setHighlightedIndex((i) =>
                            i === index ? undefined : index
                          )
                        }
                      >
                        <div className="flex-shrink text-xs opacity-10 group-hover:opacity-50 select-none">
                          {index}
                        </div>
                        <div
                          dangerouslySetInnerHTML={{
                            __html: context.getHtml(
                              index + context.getClientOffset()
                            ),
                          }}
                        />
                      </div>
                    );
                  }}
                  components={{ ScrollSeekPlaceholder }}
                />
              );
            }}
          </AutoSizer>
        )}
      </div>
    </div>
  );
}

let _scrollToIndexTimer: Timer = setTimeout(() => {}, 0);
function debouncedScrollToIndex({
  index,
  scrollToIndex,
}: {
  index: number;
  scrollToIndex: (index: number) => void;
}) {
  if (_scrollToIndexTimer) {
    clearTimeout(_scrollToIndexTimer);
  }
  _scrollToIndexTimer = setTimeout(() => scrollToIndex(index), 50);
}

function ScrollSeekPlaceholder() {
  return (
    <div className="h-2 w-full p-2 overflow-hidden">
      <div className="block h-2 bg-zinc-500/25">&nbsp;</div>
    </div>
  );
}

function Button(
  props: React.DetailedHTMLProps<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  >
) {
  return (
    <button
      type="button"
      className="cursor-pointer rounded bg-sky-500 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
      {...props}
    />
  );
}

function GhostButton(
  props: React.DetailedHTMLProps<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  >
) {
  return (
    <button
      type="button"
      className="cursor-pointer rounded border border-zinc-700 hover:border-sky-500 px-2 py-2 text-xs font-semibold text-white/75 hover:text-white shadow-sm hover:bg-sky-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
      {...props}
    />
  );
}

function Input(
  props: React.DetailedHTMLProps<
    React.InputHTMLAttributes<HTMLInputElement>,
    HTMLInputElement
  >
) {
  return (
    <input
      type="text"
      className="bg-zinc-900 outline outline-1 outline-zinc-700 hover:outline-zinc-400 focus-visible:outline-zinc-400 px-1 rounded text-zinc-50 w-full text-xs h-8 focus-visible:text-base"
      {...props}
    />
  );
}

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

function getClassName({
  highlightedItemIndex,
  index,
  isFilteredOut,
}: {
  index: number;
  highlightedItemIndex: number | undefined;
  isFilteredOut: boolean;
}): string {
  if (isFilteredOut) {
    return "h-0 overflow-hidden opacity-0";
  }

  if (index === highlightedItemIndex) {
    return "bg-amber-900/75";
  }

  const searchResultIndexes = context.searchResults();
  if (searchResultIndexes.includes(index)) {
    return "bg-amber-900/25";
  }

  return "";
}
