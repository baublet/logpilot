import React from "react";

export function Input(
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