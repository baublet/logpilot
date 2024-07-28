import { serializeClientWorkerMessage } from "../types";
import { logStore } from "./logStore";

/**
 * Manages the callbacks and iterations involved in search through and sending
 * huge amounts of data to the frontend in a batched fashion, so that users get
 * some immediate feedback, and it won't lock up the main thread (since search
 * happens in a worker).
 */
export class SearchInstance {
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
      const log = logStore.getRawLogs()[this._lastSearchedIndex];
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

export const searchInstance = new SearchInstance({
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
