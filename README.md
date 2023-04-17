<h1 align="center">
  web-worker-polyfill
</h1>
<p align="center">
  Native cross-platform Web Workers. Works in published npm modules.
</p>

**In Node**, it's a web-compatible Worker implementation atop Node's [worker_threads](https://nodejs.org/api/worker_threads.html).

**In the browser** (and when bundled for the browser), it's simply an alias of `Worker`.

### Features

_Here's how this is different from worker_threads:_

- makes Worker code compatible across browser, Node and Deno
- only supports Module Workers (`{type:'module'}`)
- uses DOM-style events (`Event.data`, `Event.type`, `MessageEvent`, etc)
- supports event handler properties (`worker.onmessage=..`)
- `Worker()` accepts a URL, Blob URL or Data URL (via loaders)
- emulates browser-style [WorkerGlobalScope] within the worker

### Usage Example

In its simplest form:

```js
import Worker from 'web-worker-polyfill'

const worker = new Worker('data:text/javascript,postMessage("hello")')
worker.onmessage = e => console.log(e.data)  // "hello"
```

<table>
<thead><tr><th><strong>main.js</strong></th><th><strong>worker.js</strong></th></tr></thead>
<tbody><tr><td>

```js
import Worker from 'web-worker-polyfill'

const url = new URL('./worker.js', import.meta.url)
const worker = new Worker(url)

worker.addEventListener('message', e => {
  console.log(e.data)  // "hiya!"
})

worker.postMessage('hello')
```

</td><td valign="top">

```js
addEventListener('message', e => {
  if (e.data === 'hello') {
    postMessage('hiya!')
  }
})
```

</td></tr></tbody>
</table>

👉 Notice how `new URL('./worker.js', import.meta.url)` is used above to load the worker relative to the current module instead of the application base URL. Without this, Worker URLs are relative to a document's URL, which in Node.js is interpreted to be `process.cwd()`.

> _Support for this pattern in build tools and test frameworks is still limited. We are [working on growing this](https://github.com/developit/web-worker/issues/4)._

### Module Workers

Module Workers are supported in Node 12.8+ using this plugin, leveraging Node's native ES Modules support.
In the browser, they can be used natively in Chrome 80+, or in all browsers via [worker-plugin] or [rollup-plugin-off-main-thread]. As with classic workers, there is no difference in usage between Node and the browser:

<table>
<thead><tr><th><strong>main.js</strong></th><th><strong>worker.js</strong></th></tr></thead>
<tbody><tr><td>

```js
import Worker from 'web-worker-polyfill'

const worker = new Worker(
  new URL('./worker.js', import.meta.url),
  { type: 'module' }
)
worker.addEventListener('message', e => {
  console.log(e.data)  // "200 OK"
})
worker.postMessage('https://httpstat.us/200')
```

</td><td valign="top">

```js
addEventListener('message', async e => {
  const url = e.data
  const res = await fetch(url)
  const text = await res.text()
  postMessage(text)
})
```

</td></tr></tbody>
</table>


### Data URLs

Instantiating Worker using a Data URL is supported in both module and classic workers:

```js
import Worker from 'web-worker-polyfill'

const worker = new Worker(`data:application/javascript,postMessage(42)`)
worker.addEventListener('message', e => {
  console.log(e.data)  // 42
})
```

### Blob URLs

Instantiating Worker using a Blob URL is supported

```js
import Worker from 'web-worker-polyfill'

const code = 'import fs from "node:fs"'
const blob = new Blob([code], { type: 'text/javascript' })
const worker = new Worker(URL.createObjectURL(blob))
```

### HTTP loader supported.

Worker gets added https- loader support via `--loader` flag

```js
import Worker from 'web-worker-polyfill'

const code = 'import xyz from "https://example.com/main.js"'
const blob = new Blob([code], { type: 'text/javascript' })
const worker = new Worker(URL.createObjectURL(blob))
```

```js
import Worker from 'web-worker-polyfill'

const url = 'https://example.com/main.js'
const worker = new Worker(url)
```


# Worker global scope

Each time when creating a new Worker it will get assigned some new global variables
including
- name
- Worker (to create worker within a worker)
- self
- postMessage
- and global will be inherit EventTarget (addEventListener, remove and dispatch)

The worker thread isn't really instantiated with code to eval or any path.
instead everything is imported with lazy import `import(url)` or `import('data:')`
in order to support esm inside the workers.