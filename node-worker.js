import { Worker as NodeWorker, BroadcastChannel, receiveMessageOnPort } from 'node:worker_threads'
import { resolveObjectURL, Buffer } from 'node:buffer'
import { execArgv, cwd, version } from 'node:process'

/**
 * A synchronous FileReader implementation that uses a Web Worker to read the
 * contents of a Blob.
*/
let createBlobReader = () => {
  const shared = new SharedArrayBuffer(4)
  const int32 = new Int32Array(shared)
  const { port1: localPort, port2: workerPort } = new MessageChannel()
  const reader = `
  import { workerData, parentPort } from 'worker_threads'
  const { shared, port } = workerData
  port.addEventListener('message', async evt => {
    port.postMessage(await evt.data.text())
    Atomics.notify(new Int32Array(shared), 0)
  })
  `

  const b64 = Buffer.from(reader).toString('base64')
  const dataUrl = 'data:text/javascript;base64,' + b64

  new NodeWorker(new URL(dataUrl), {
    workerData: { shared, port: workerPort },
    transferList: [ workerPort ]
  }).unref()

  const blobReader = function readBlobUrlSync (blobUrl) {
    const blob = resolveObjectURL(blobUrl)
    localPort.postMessage(blob)
    Atomics.wait(int32, 0, 0)
    return receiveMessageOnPort(localPort).message
  }

  createBlobReader = () => blobReader
  return blobReader
}

const major = +version.slice(1).split('.')[0]
let loaderPath = './loader.js'

if ([16, 17].includes(major)) {
  loaderPath = './node-loader-v16.js'
  const { Blob } = await import('node:buffer')
  globalThis.Blob = Blob
} else if ([18, 19, 20].includes(major)) {
  loaderPath = './node-loader-v18.js'
}

// Create a BroadcastChannel to listen for messages containing blob URLs and
// respond with the contents of those blobs to loaders so that
// `import('blob:x')` works.
const bc = new BroadcastChannel('blob: loader')
bc.addEventListener('message', async evt => {
  const url = evt.data
  const blob = resolveObjectURL(url)
  if (blob) {
    const source = await blob.text()
    bc.postMessage({url, source})
  }
})
bc?.unref()

// Define a custom ErrorEvent class that includes an `error` property.
globalThis.ErrorEvent ??= class ErrorEvent extends Event {
  constructor (type, { error }) {
    super(type)
    this.error = error
  }
}

// Define a custom Web Worker class that extends EventTarget.
const WebWorker = class Worker extends EventTarget {
  #onmessage = null
  #onerror = null

  #worker

    /**
   * @param {string} scriptURL - The URL of the worker script to load.
   * @param {WorkerOptions} [options] - Additional options to pass to the worker.
   */
  constructor (scriptURL, options = {}) {
    super()
    const { name, type } = options

    if (type !== 'module') {
      throw new Error(
        'Sorry, only module workers are supported\n' +
        'Use: new Worker(path, { type: "module" })\n'
      )
    }

    this.#loadModule(new URL(scriptURL, 'file://' + cwd()), name)
  }

  /**
   * Add an event listener for the given type of event.
   * @param {string} type - The type of event to listen for (e.g. "message").
   * @param {*} listener - The function to call when the event occurs.
   * @param {...*} rest - additional arguments to pass to the `addEventListener`
   */
  addEventListener(type, listener, ...rest) {
    super.addEventListener(type, listener, ...rest)

    // If the type of event being listened for is "message", forward messages
    // received from the worker to the event listeners.
    if (type === 'message') {
      this.#worker.on('message', data => {
        const evt = new MessageEvent('message', { data })
        this.dispatchEvent(evt)
      })
    }
  }

  /**
   * Send a message to the worker.
   * @param {...*} args - The data and transfer list to send to the worker.
   */
  postMessage (...args) {
    this.#worker.postMessage(...args)
  }

  /**
   * Load the module at the given URL as a worker.
   * @param {URL} url - The URL of the worker script to load.
   * @param {string} [name] - A name for the worker (not used in this implementation).
   */
  #loadModule (url, name) {
    const preRun = new URL('./pre-run.js', import.meta.url).toString()

    // If the URL protocol is blob or https, convert it to a data: URL with import(url)
    if (url.protocol === 'blob:') {
      const blobReader = createBlobReader()
      const code = `import '${preRun}'\n` + blobReader(`${url}`)
      const b64 = Buffer.from(code).toString('base64')
      url = new URL('data:text/javascript;base64,' + b64)
    } else {
      url = new URL(`data:text/javascript,import '${preRun}';await import('${url}');`)
    }

    const loader = new URL(
      loaderPath,
      import.meta.url
    ).href.replace('file://', '')

    const execArgv = [
      '--no-warnings',
      '--loader', loader,
      '--experimental-loader', loader,
    ]

    const worker = new NodeWorker(
      url,
      {
        workerData: { name },
        execArgv
      }
    )

    // Set up event listeners for the worker events
    worker.on('exit', () => {
      this._exited = true
    })

    worker.on('error', error => {
      // Create a new `ErrorEvent` and dispatch it to the event target
      const evt = new ErrorEvent('error', { error })
      this.dispatchEvent(evt)
    })

    // worker.on('close', () => noop)

    this.#worker = worker
  }

  /** Terminates the web worker */
  terminate () {
    this.#worker.terminate()
  }

  /**
   * Sets the error event listener for the web worker.
   * @param {Function} fn - The error event listener function.
   */
  set onerror (fn) {
    // Remove the previous error event listener, if any
    if (this.#onerror) this.removeEventListener('error', this.#onerror)

    // Save the new error event listener function to the private property
    this.#onerror = fn

      // Add the new error event listener function to the event target
    if (typeof fn === 'function') {
      this.addEventListener('error', fn)
    } else {
      this.#onerror = null
    }
  }

  /**
   * Gets the error event listener for the web worker.
   * @returns {Function|null} - The error event listener function.
   */
  get onerror () {
    return this.#onerror
  }

  /**
   * Sets the message event listener for the web worker.
   * @param {Function|null} fn - The message event listener function.
   */
  set onmessage (fn) {
    if (this.#onmessage) this.removeEventListener('message', this.#onmessage)
    this.#onmessage = fn

    if (typeof fn === 'function') {
      this.addEventListener('message', fn)
    } else {
      this.#onmessage = null
    }
  }

  get onmessage () {
    return this.#onmessage
  }
}

/** @type {typeof Worker} */
export default WebWorker
