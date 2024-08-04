let inputMode: "pipe" | "command";

export function isInputPipe(): boolean {
  return getInputMode() === "pipe";
}

export function getInputMode(): "pipe" | "command" {
  if (inputMode) {
    return inputMode;
  }
  
  const isProbablyPiped = process.stdout.isTTY === undefined;
  if (!isProbablyPiped) {
    inputMode = "command";
  } else {
    inputMode = "pipe";
  }

  return inputMode;
}
