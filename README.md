# LogPilot

LogPilot is a command runner that pipes logs to a thin, but powerful log viewer written in modern JavaScript. Features:

- Clean command-side user experience
- Performance-minded user interface, utilizing modern web workers
- Simple, single-binary experience
- Search using a simple term or utilizing line-by-line regular expressions
- Flexible, performant log-line filtering and context expansion
- Start, stop, and restart your development command from the browser

```sh
$ npx logpilot npm run develop

✈️  LogPilot
http://localhost:51515?secret
⚠️  To show logs in the console use -L 
```

## Development

```sh
$ pnpm install
$ pnpm run dev         # Default mode, e.g., `npx logpilot yarn start`
$ pnpm run dev:piped   # Piped input, e.g., `yarn start | npx logpilot`
```

## Building

```sh
pnpm run build
```
