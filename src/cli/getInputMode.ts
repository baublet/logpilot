let inputMode: "pipe" | "command" = "pipe";

export function isInputPipe(): boolean {
  return getInputMode() === "pipe";
}

export function getInputMode(): "pipe" | "command" {
  if (inputMode) {
    return inputMode;
  }

  const isProbablyPiped = process.stdin.isTTY === undefined;
  if (!isProbablyPiped) {
    inputMode = "pipe";
  } else {
    inputMode = "command";
  }

  return inputMode;
}
