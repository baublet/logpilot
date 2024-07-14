import http from "http";

const biggerNumberForMoreLogs = 3000;

let totalTestLogs = 0;

setInterval(() => {
  // Create a series of timers that create random logs for the next second
  for (let i = 0; i < 10; i++) {
    setTimeout(() => {
      const rando = Math.random();
      const method = (() => {
        if (rando < 0.25) return "debug";
        if (rando < 0.5) return "log";
        if (rando < 0.75) return "warn";
        return "error";
      })();
      console[method](Date.now() + ` ${totalTestLogs++} (${method}) Log`);
    }, Math.random() * biggerNumberForMoreLogs);
  }
}, biggerNumberForMoreLogs);

const port = 8945;

http
  .createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.write("Hello, world!");
    res.end();
  })
  .listen(port, () => {
    // This is to make sure the port is not already in use. Good for testing our app is terminating child processes correctly
    console.log(`App is running on port ${port}`);
  });
