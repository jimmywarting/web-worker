import { Console } from 'node:console'
import { parentPort, workerData } from 'node:worker_threads'
import { Writable } from 'node:stream'
import { writeSync } from 'node:fs'
import process from 'node:process'

import Worker from './node-worker.js'

const { exit } = process
const { name, stdout, stderr } = workerData

process.stdout.fd = stdout
process.stderr.fd = stderr

/******************************************************************************/
/* Change the way logs are printed to stdout and stderr                       */
/* NodeJS seems to be sending the chunks back to the main thread with         */
/* postMessage and then printing them to main stdout and stderr               */
/*                                                                            */
/* An alternative approach would be to just get the parents stdout and stderr */
/* fd and write to them directly                                              */
/*                                                                            */
/* see:                                                                       */
/* http://github.com/jimmywarting/await-sync/issues/1#issuecomment-1537551754 */
/* https://github.com/nodejs/node/issues/47923                                */
/******************************************************************************/
const stdio = fd => Writable.fromWeb(new WritableStream({
  write (chunk) {
    writeSync(fd, chunk)
  }
}))

let onmessage = null

class WorkerGlobalScope extends EventTarget {

  constructor () {
    super()
    this.close = exit
    this.name = name
    this.self = globalThis
    this.Worker = Worker
    this.console = globalThis.console = new Console(stdio(stdout), stdio(stderr))
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
