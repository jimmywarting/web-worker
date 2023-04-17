import { isMainThread, Worker as NodeWorker, workerData } from 'node:worker_threads'
import { cwd } from 'node:process'
import { resolveObjectURL } from 'node:buffer'

const baseUrl = new URL(cwd(), 'file://')

const ErrorEvent = globalThis.ErrorEvent || class ErrorEvent extends Event {
  constructor (type, { error }) {
    super(type)
    this.error = error
  }
}

function mainThread () {
  /**
	 * A web-compatible Worker implementation atop Node's worker_threads.
	 *  - uses DOM-style events (Event.data, Event.type, etc)
	 *  - supports event handler properties (worker.onmessage)
	 *  - Worker() constructor accepts a module URL
	 *  - accepts the {type:'module'} option
	 *  - emulates WorkerGlobalScope within the worker
	 * @param {string} url  The URL or module specifier to load
	 * @param {object} [options]  Worker construction options
	 * @param {string} [options.name]  Available as `self.name` within the Worker
	 * @param {string} [options.type="classic"]  Pass "module" to create a Module Worker.
	 */
  class Worker extends EventTarget {
    onmessage = null
    onerror = null
    onclose = null

    #worker
    #mc = new MessageChannel()

    /**
		 * @param {string} scriptURL
		 * @param {WorkerOptions} [options]
		 */
    constructor (scriptURL, options = {}) {
      super()

      const { name, type } = options
      scriptURL += ''

      if (type !== 'module') {
        throw new Error(
          'Sorry, only module workers are supported\n' +
          'Use: new Worker(path, { type: "module" })\n'
        )
      }

      const { port1 } = this.#mc

      port1.addEventListener('message', evt => {
        const event = new MessageEvent('message', { data: evt.data })
        this.dispatchEvent(event)
        this.onmessage?.(event)
      })

      this.postMessage = port1.postMessage.bind(port1)

      this.#loadModule(scriptURL, name)
    }

    async #loadModule (url, name) {
      if (url.startsWith('blob:')) {
        const blob = resolveObjectURL(url)
        const code = await blob.text()
        // convert code to data: URL
        url = `data:text/javascript,${encodeURIComponent(code)}`
      }

      const mod = url.startsWith('data:')
        ? url
        : url.startsWith('blob:')
          ? resolveObjectURL(url)
          : new URL(url, baseUrl).href

      const { port2 } = this.#mc

      const worker = new NodeWorker(
        import.meta.url.slice(7),
        {
          workerData: { mod, name, port: port2 },
          transferList: [port2]
        }
      )

      worker.on('exit', () => {
        this._exited = true
      })

      worker.on('error', error => {
        const evt = new ErrorEvent('error', { error })
        this.dispatchEvent(evt)
        this.onerror?.(evt)
      })

      worker.on('close', () => {

      })

      this.#worker = worker
    }

    terminate () {
      this.#worker.terminate()
    }
  }

  return Worker
}

function workerThread () {
  const { mod, name, port } = workerData

  Object.assign(globalThis, { name, self: globalThis, Worker: mainThread() })

  // enqueue messages to dispatch after modules are loaded
  function setupListeners () {
    port.addEventListener('message', evt => {
      const event = new MessageEvent('message', { data: evt.data })
      globalThis.dispatchEvent(event)
      globalThis.onmessage?.(event)
    })
  }

  class WorkerGlobalScope extends EventTarget {
    postMessage (data, transferList) {
      port.postMessage(data, transferList)
    }

    close () {
      process.exit()
    }
  }
  let proto = Object.getPrototypeOf(globalThis)
  delete proto.constructor
  Object.defineProperties(WorkerGlobalScope.prototype, proto)
  proto = Object.setPrototypeOf(globalThis, new WorkerGlobalScope());
  ['postMessage', 'addEventListener', 'removeEventListener', 'dispatchEvent'].forEach(fn => {
    proto[fn] = proto[fn].bind(globalThis)
  })

  import(mod).then(setupListeners)
}

/** @type {typeof Worker} */
export default isMainThread ? mainThread() : workerThread()
