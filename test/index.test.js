import test, * as t from 'node:test'
import assert from 'node:assert'
import Worker from '../node-worker.js'

const url = new URL('./fixtures/worker.mjs', import.meta.url)
const one = (worker, t = 'message') => new Promise(rs => worker.addEventListener(t, rs, { once: true }))
const code = code => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))

t.describe('Code evaluation', () => {
  test('Basic module usage', async t => {
    const worker = new Worker(url, { type: 'module' })
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
    const url = code`import fs from 'node:fs'; postMessage(typeof fs.stat)`

    const worker = new Worker(url, { type: 'module' })
    const type = (await one(worker)).data
    worker.terminate()
    assert.equal(type, 'function', 'should have received a message event')
  })

  test('data:', async t => {
    const code = 'import fs from \'node:fs\'; postMessage(typeof fs.stat)'
    const worker = new Worker(`data:text/javascript,${code}`, { type: 'module' })
    const type = (await one(worker)).data
    worker.terminate()
    assert.equal(type, 'function', 'should have received a message event')
  })

  test('invalid code dispatch eventListener', async t => {
    const url = code`a+b`
    const worker = new Worker(url, { type: 'module' })
    const err = (await one(worker, 'error')).error
    worker.terminate()
    assert.ok(err instanceof Error, 'should have received an error event')
  })

  test('invalid code dispatch onerror', async t => {
    const url = code`a+b`
    const worker = new Worker(url, { type: 'module' })
    const err = await new Promise(rs => {
      worker.onerror = evt => rs(evt.error)
    })
    worker.terminate()
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
        'received message event',
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
      worker.onmessage = evt => {
        rs(evt.data)
        worker.onmessage = null
      }
    })
    worker.terminate()
    assert.equal(type, 3, 'should have received a message event')
  })

  test('worker.addEventListener', async t => {
    const url = code`postMessage(3)`
    const worker = new Worker(url, { type: 'module' })
    const { data } = (await one(worker))
    worker.terminate()
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
    worker.terminate()
    assert.equal(data, 'hello', 'should have received a message event')
  })

  test('self.onmessage inside worker works', async t => {
    const url = code`self.onmessage = evt => postMessage(evt.data)`
    const worker = new Worker(url, { type: 'module' })
    worker.postMessage('hello')
    const data = await new Promise(rs => {
      worker.onmessage = evt => rs(evt.data)
    })
    worker.terminate()
    assert.equal(data, 'hello', 'should have received a message event')
  })

  test('globalThis.onmessage inside worker works', async t => {
    const url = code`globalThis.onmessage = evt => postMessage(evt.data)`
    const worker = new Worker(url, { type: 'module' })
    worker.postMessage('hello')
    const data = await new Promise(rs => {
      worker.onmessage = evt => rs(evt.data)
    })
    worker.terminate()
    assert.equal(data, 'hello', 'should have received a message event')
  })

  test('Worker within a Worker', async t => {
    const url = code`
			const code = 'postMessage(3)'
			const blob = new Blob([code], { type: 'text/javascript' })
			const url = URL.createObjectURL(blob)

			const worker = new Worker(url, { type: 'module' })
			worker.onmessage = evt => postMessage(evt.data)
		`

    const worker = new Worker(url, { type: 'module' })
    const { data } = (await one(worker))
    worker.terminate()
    assert.equal(data, 3, 'should have received a message event')
  })
})
