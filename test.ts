process.stdin.on('data', (input) => {
  console.log(input);
});

console.log({
  isTty: process.stdin.isTTY,
  test: process.stdin.read(0)
})