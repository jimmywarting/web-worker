# Web `Worker` polyfill for Node.js

👷‍♂️ A spec-compliant `Worker` class for Node.js

<div align="center">

![](https://picsum.photos/600/400)

</div>

📜 Implements the `Worker` class from the HTML specification \
🦄 Supports ponyfilling instead of polyfilling \
🧊 Isomorphically exports the normal `Worker` global in browsers & Deno \
📦 Supports `{ type: "module" }` workers \
⚠️ Doesn't provide `WorkerNavigator` or `WorkerLocation`

## Installation

![npm](https://img.shields.io/static/v1?style=for-the-badge&message=npm&color=CB3837&logo=npm&logoColor=FFFFFF&label=)
![Yarn](https://img.shields.io/static/v1?style=for-the-badge&message=Yarn&color=2C8EBB&logo=Yarn&logoColor=FFFFFF&label=)
![pnpm](https://img.shields.io/static/v1?style=for-the-badge&message=pnpm&color=222222&logo=pnpm&logoColor=F69220&label=)

Normally, you'll want to use this package in a Node.js environment. If you
import it using an npm CDN like [ESM>CDN] or [jsDelivr], you'll just be getting
the native global `Worker` class. You can install it locally for use in Node.js
using npm, [Yarn], [pnpm], or your other favorite npm-related package manager.

```sh
npm install whatwg-worker
```

## Usage

![Node.js](https://img.shields.io/static/v1?style=for-the-badge&message=Node.js&color=339933&logo=Node.js&logoColor=FFFFFF&label=)

The easiest way to use this package is just to import it as a polyfill. This
will add the `Worker` class to the global scope just like in the browser.

<table><td>

```js
// app.js
import "whatwg-worker";

// 💡 You can use 'new URL()' or 'import.meta.resolve()' to pass a URL relative
// to the current file! Otherwise, it'd be relative to 'process.cwd()'.
const worker = new Worker(new URL("worker.js", import.meta.url));
worker.postMessage("Hello!");
worker.onmessage = (e) => console.log("[main]", e.data);
//=> [worker] Hello!
//=> [main] Hi!
```

<td>

```js
postMessage("Hi!");
onmessage = (e) => console.log("[worker]", e.data);
```

</table>

ℹ Make sure your bundler supports the `new URL("...", import.meta.url)` or
`import.meta.resolve()` pattern! We recommend [Vite] which supports
`new Worker(new URL("...", import.meta.url))` out of the box! ❤️

If you're authoring a library, or you want to avoid tampering with globals, you
can also just import the `Worker` class from the `whatwg-worker/ponyfill.js`
export. The ponyfill will **not** apply the `WorkerGlobalScope` polyfill to any
workers that you instantiate witht it! You'll still need to
`import { parentPort } from "node:worker_threads"` to communicate with the
parent thread.

We also support `data:` and `blob:` URLs! 🙌

```js
import "whatwg-worker";

const js = `console.log(42)`;

const data = "data:text/javascript," + encodeURIComponent(js);
const worker1 = new Worker(data);
//=> 42

const blob = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
const worker2 = new Worker(blob);
//=> 42
```

💡 If you're looking for a more ergonomic cross-thread interface, check out
[GoogleChromeLabs/comlink] or [developit/greenlet]!

If you want to enable HTTP imports to be more like browsers, you can use the
`--experimental-network-imports` flag! Be warned that native `node:` imports
will throw if imported from `http:` URLs.

📚 [HTTPS and HTTP imports | Node.js v20.2.0 Documentation]

### Differences from `import { Worker } from "node:worker_threads"`

Node.js provides a native name-clashing implementation of the `Worker` class
that isn't _quite_ the same as the browser `Worker` class. Here's a brief
comparison of Node.js' `worker.Worker` vs our `Worker` class:

1. `worker.Worker` extends the Node.js `EventEmitter` instead of `EventTarget`.
   It also provides the event's data directly as arguments instead of wrapped in
   an `Event` object. We use `EventTarget` and proper spec-compliant
   `MessageEvent` instances just like browsers.
2. `worker.Worker` supports `spawn()`-like options like `argv` and `env`. Our
   own web `Worker` class doesn't support this.[^1]
3. `worker.Worker` allows direct `new Worker("console.log()", { eval: true })`
   script execution. Be warned that it's a global `eval()`-like context, not a
   module context. You can achieve a similar effect with web workers using
   `data:` or `blob:` URLs.
4. `worker.Worker` doesn't support `.onmessage = ...`. This is common among most
   Node.js APIs.
5. When a new worker thread is spawned by `new worker.Worker()`, it is just a
   regular Node.js global scope. There's no `.postMessage()` to talk to the
   parent; you have to import that from `node:worker_threads` yourself! We make
   the global scope an instance of `DedicatedWorkerGlobalScope` just like
   browsers do.

## Spec compliance

We don't implement the entirety of the `Worker`-related parts of the HTML spec.
There's no `WorkerNavigator` or `WorkerLocation`. There's also no
`importScripts()`. We also don't provide the related `online`, `offline`, or
`languagechange` events.

⚠️ `importScripts()` will not work! You can use `require()` in non-ESM workers,
but be warned that we don't provide an `importScripts()` function.

Here's a rundown of the Web IDL that we expose in the polyfill:

```webidl
[Exposed=*]
interface Worker : EventTarget {
  constructor(USVString scriptURL, optional WorkerOptions options = {});

  undefined terminate();

  undefined postMessage(any message, sequence<object> transfer);
  undefined postMessage(any message, optional StructuredSerializeOptions options = {});
  attribute EventHandler onmessage;
  attribute EventHandler onmessageerror;
};
dictionary WorkerOptions {
  WorkerType type = "classic";
  DOMString name = "";
};
enum WorkerType { "classic", "module" };
Worker includes AbstractWorker;
interface mixin AbstractWorker {
  attribute EventHandler onerror;
};

[Exposed=Worker]
interface WorkerGlobalScope : EventTarget {
  readonly attribute WorkerGlobalScope self;

  attribute OnErrorEventHandler onerror;
  attribute EventHandler onrejectionhandled;
  attribute EventHandler onunhandledrejection;
};
```

## Development

This project uses JSDoc with `tsc` to perform type checking. We do still
generate `.d.ts` files at build time, don't worry! To get started with our dev
loop, you can open this repo in your favorite IDE and run `npm start`. If you
want to get started quickly, you can use [GitHub Codespaces]. This will start
the Node.js test runner (yes, Node.js has a builtin `--test` flag now!) in watch
mode. Make some changes or add some tests and see what happens!

<!-- prettier-ignore-start -->
[HTTPS and HTTP imports | Node.js v20.2.0 Documentation]: https://nodejs.org/api/esm.html#https-and-http-imports
[GitHub Codespaces]: https://github.com/features/codespaces
[GoogleChromeLabs/comlink]: https://github.com/GoogleChromeLabs/comlink#readme
[developit/greenlet]: https://github.com/developit/greenlet#readme
<!-- prettier-ignore-end -->
