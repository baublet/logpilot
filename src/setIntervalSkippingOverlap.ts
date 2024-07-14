export function setIntervalSkippingOverlap(
  callback: Callback,
  interval: number,
  options?: SetIntervalSkippingOverlapOptions
): Timer {
  let isRunning = false;

  function setRunning() {
    isRunning = true;
  }

  function doNothing() {}

  return setInterval(() => {
    if (isRunning) {
      return false;
    }

    isRunning = true;

    // do work
    try {
      const result = callback();

      if (isPromiseLike(result)) {
        return result
          .then(doNothing)
          ?.catch((error) => {
            if (options?.onError) {
              options?.onError?.(error);
            } else {
              console.error(error);
            }
          })
          ?.finally(setRunning);
      } else {
        isRunning = false;
      }
    } catch (error) {
      if (options?.onError) {
        options?.onError?.(error);
      } else {
        console.error(error);
      }
    }
  }, interval);
}

type SetIntervalSkippingOverlapOptions = {
  onError?: (error: unknown) => void;
};

type Callback = SyncCallback | AsyncCallback;
type SyncCallback = () => void;
type AsyncCallback = () => Promise<void>;

function isPromiseLike(value: void | Promise<void>): value is Promise<void> {
  return typeof (value as any)?.then === "function";
}
