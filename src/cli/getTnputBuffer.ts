import { getInputMode } from "./getInputMode";

let inputBuffer: Buffer[] = [];

export function getInputBuffer() {
  return inputBuffer;
}

export function setInputBufferAndReturnOld(buffer: Buffer[]): Buffer[] {
  const oldBuffer = inputBuffer;
  inputBuffer = buffer;
  return oldBuffer;
}

try {
  process.stdin.on("data", (input) => {
    const inputMode = getInputMode();
    if (inputMode === "command") {
      return;
    }
    inputBuffer.push(input);
  });
} catch (e) {
  // Some environments don't have a TTY. That's not an error
  if ((e as any)?.code !== "EINVAL") {
    throw e;
  }
}
