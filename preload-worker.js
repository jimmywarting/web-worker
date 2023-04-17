import { parentPort, workerData } from 'node:worker_threads'
import { exit } from 'node:process'
import Worker from './node-worker.js'

const { name } = workerData
let onmessage = null

class WorkerGlobalScope extends EventTarget {

  constructor () {
    super()
    this.close = exit
    this.name = name
    this.self = globalThis
    this.Worker = Worker
  }

  postMessage(...args) {
    parentPort.postMessage(...args)
  }

  set onmessage (fn) {
    const old = onmessage
    if (old) this.removeEventListener('message', old)

    onmessage = fn
    if (typeof fn === 'function') {
      this.addEventListener('message', fn)
    } else {
      onmessage = null
    }
  }

  get onmessage () {
    return onmessage
  }

  addEventListener(...args) {
    args[0] === 'message'
      ? parentPort.addEventListener(...args)
      : super.addEventListener(...args)
  }

  removeEventListener(...args) {
    args[0] === 'message'
      ? parentPort.removeEventListener(...args)
      : super.removeEventListener(...args)
  }

  dispatchEvent(...args) {
    args[0] === 'message'
      ? parentPort.dispatchEvent(...args)
      : super.dispatchEvent(...args)
  }
}

// Make WorkerGlobalScope the prototype of globalThis
// So that it inherits all the properties of EventTarget

const proto = Object.getPrototypeOf(globalThis)
delete proto.constructor
Object.defineProperties(WorkerGlobalScope.prototype, proto)
Object.setPrototypeOf(globalThis, new WorkerGlobalScope())
