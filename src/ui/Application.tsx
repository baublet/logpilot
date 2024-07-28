import React from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import AutoSizer from "react-virtualized-auto-sizer";
import { context } from "./helpers/context";
import { debouncedScrollToIndex } from "./helpers/debouncedScrollToIndex";
import { Button } from "./components/Button";
import { Input } from "./components/Input";
import { GhostButton } from "./components/GhostButton";
import { ScrollSeekPlaceholder } from "./components/ScrollSeekPlaceholder";

export function Application() {
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

  let searchTermTimerRef = React.useRef<any>();
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
  const filterTermTimerRef = React.useRef<any>();
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
