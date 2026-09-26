// Evaluate JS inside a Desktop Buddy webview via WebView2's remote debugging port
// (launch with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223").
//   node cdp.mjs <url-substring> "<expression>"
const [, , match, expr] = process.argv;
const PORT = process.env.CDP_PORT ?? 9223;
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = targets.find((t) => t.type === 'page' && t.url.includes(match));
if (!target) {
  console.error('no target; have:', targets.map((t) => t.url).join(', '));
  process.exit(1);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const result = await new Promise((resolve) => {
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id === 1) resolve(msg.result);
  });
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true },
    }),
  );
});
console.log(JSON.stringify(result.result?.value ?? result.exceptionDetails ?? result, null, 1));
ws.close();
