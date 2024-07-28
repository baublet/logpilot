import React from "react";

export function GhostButton(
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