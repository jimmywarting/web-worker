// import test, * as t from 'node:test'
import assert from 'node:assert'
import Worker from '../node-worker.js'
import { test } from 'node:test'
import t from 'node:test'
import { version } from 'node:process'

const major = +version.slice(1, 3)

const url = new URL('./fixtures/worker.js', import.meta.url)
const one = (worker, t = 'message') => new Promise(rs => worker.addEventListener(t, rs, { once: true }))
const code = code => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))

t.describe('Code evaluation', () => {
  test('Basic module usage', async t => {
    const worker = new Worker(url, { type: 'module' })
    // worker.onmessage = console.log
    const num = (await one(worker)).data
    worker.terminate()
    assert.equal(num, 42, 'should have received a message event')
  })

  test('Omitting { type: "module" } fails', async t => {
    assert.throws(() => {
      new Worker(url)
    }, /only module workers are supported/)
  })

  test('blob:', async t => {
    const url = code`postMessage(100)`
    const worker = new Worker(url, { type: 'module' })
    const { data } = await one(worker)
    worker.terminate()
    assert.equal(data, 100, 'should have received a message event')
  })

  test('data:', async t => {
    const code = 'postMessage(387)'
    const worker = new Worker(`data:text/javascript,${code}`, { type: 'module' })
    const {data} = await one(worker)
    assert.equal(data, 387, 'should have received a message event')
  })

  // TODO: fix this experimental http loader in NodeJS v20+
  test('http:', async t => {
    if (major >= 20) return t.skip('Not supported in Node.js')

    const url = 'https://raw.githubusercontent.com/elcuervo/wire/8a219697c560ac156ea8dc24fa1f5296091d51b4/test/worker.js'
    const worker = new Worker(url, { type: 'module' })
    const {data} = await one(worker)
    assert.equal(data, 1, 'should have received a message event')
  })

  // Hard to test, need to look manually above this test result
  test('logs in correct order', async t => {
    const ab = new SharedArrayBuffer(4)
    const int32 = new Int32Array(ab)
    const url = code`
      console.log('comes first')
      self.onmessage = evt => {
        const int32 = new Int32Array(evt.data)
        Atomics.store(int32, 0, 42)
        Atomics.notify(int32, 0)
      }
    `
    const sleep = ms => new Promise(rs => setTimeout(rs, ms))
    const worker = new Worker(url, { type: 'module' })
    worker.onerror = console.log
    await sleep(1000)
    worker.postMessage(ab)
    Atomics.wait(int32, 0, 0, 2100)
    console.log('comes second')
    worker.terminate()
  })

  test('invalid code dispatch eventListener', async t => {
    const url = code`a+b`
    const worker = new Worker(url, { type: 'module' })
    const err = (await one(worker, 'error')).error
    assert.ok(err instanceof Error, 'should have received an error event')
  })

  test('invalid code dispatch onerror', async t => {
    const url = code`a+b`
    const worker = new Worker(url, { type: 'module' })
    const err = await new Promise(rs => {
      worker.onerror = evt => rs(evt.error)
    })
    assert.ok(err instanceof Error, 'should have received an error event')
  })

  test('It can echo back a postMessage', async t => {
    const worker = new Worker(url, { type: 'module' })
    const msg = { greeting: 'hello' }
    worker.postMessage(msg)
    const num = (await one(worker)).data
    const response = (await one(worker)).data
    worker.terminate()
    assert.deepEqual(
      response,
      [
        'received onmessage',
        { greeting: 'hello' }
      ]
    )

    assert.equal(num, 42, 'should have received a message event')
  })
})

// Test to make sure the main thread act as it should.
t.describe('Main thread', () => {
  test('worker.onmessage', async t => {
    const url = code`postMessage(3)`
    const worker = new Worker(url, { type: 'module' })
    const type = await new Promise(rs => {
      worker.onmessage = evt => { rs(evt.data) }
    })
    assert.equal(type, 3, 'should have received a message event')
  })

  test('worker.addEventListener', async t => {
    const url = code`postMessage(3)`
    const worker = new Worker(url, { type: 'module' })
    const { data } = await one(worker)
    assert.equal(data, 3, 'should have received a message event')
  })
})

// Test to make sure the worker thread act as it should.
t.describe('Worker thread', () => {
  test('addEventListener("message") inside worker works', async t => {
    const url = code`addEventListener('message', evt => postMessage(evt.data), { once: true })`
    const worker = new Worker(url, { type: 'module' })
    worker.postMessage('hello')
    const { data } = (await one(worker))
    assert.equal(data, 'hello', 'should have received a message event')
  })

  test('self.onmessage inside worker works', async t => {
    const url = code`
      self.onmessage = evt => {
        postMessage(evt.data)

        // Removing all listener should terminate the worker.
        // Removing this will make the test hang.
        self.onmessage = null
      }
    `
    const worker = new Worker(url, { type: 'module' })
    worker.postMessage('hello')
    const data = await new Promise(rs => {
      worker.onmessage = evt => rs(evt.data)
    })
    assert.equal(data, 'hello', 'should have received a message event')
  })

  test('new Worker("blob:url") within a worker', async t => {
    const url = code`
			const code = 'postMessage(3)'
			const blob = new Blob([code], { type: 'text/javascript' })
			const url = URL.createObjectURL(blob)

			const worker = new Worker(url, { type: 'module' })

      // Unlike the test above, this worker is terminated after it have sent a message.
      // So there this listener don't need to be removed.
			worker.onmessage = evt => postMessage(evt.data)
		`

    const worker = new Worker(url, { type: 'module' })
    const { data } = (await one(worker))
    assert.equal(data, 3, 'should have received a message event')
  })

	// TODO: fix this experimental http loader in NodeJS v20+
  test('import from "https:" within a worker', async t => {
    if (major >= 20) return t.skip('Not supported in Node.js')

    const url = code`
			import toUint8 from 'https://raw.githubusercontent.com/jimmywarting/to-uint8array/main/mod.js'
			postMessage(toUint8('abc'))
		`

    const worker = new Worker(url, { type: 'module' })
    const { data } = (await one(worker))
		assert.deepEqual([...data], [97, 98, 99], 'should have received a message event')
		assert.ok(data instanceof Uint8Array, 'should have received a Uint8Array')
  })

  // TODO: fix this experimental http loader in NodeJS v20+
  test('import("blob:") within a worker', async t => {
    if (major >= 20) return t.skip('Not supported in Node.js')

    const url = code`
			const blob = new Blob(['export default 123'], { type: 'text/javascript' })
      const url = URL.createObjectURL(blob)

      import(url).then(mod => {
        postMessage(mod.default)
      })
		`

    const worker = new Worker(url, { type: 'module' })
    const { data } = (await one(worker))
		assert.deepEqual(data, 123, 'should have received a message event')
  })
})
