/**
 * Scrolls to a place on screen, with a debounce, so that we minimize screen
 * jitter.
 */
export function debouncedScrollToIndex({
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

let _scrollToIndexTimer: any;
