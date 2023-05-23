import { get } from 'node:https'
import { BroadcastChannel } from 'node:worker_threads'
import { resolveObjectURL } from 'node:buffer'

// Make it easier to debug
;['stdout', 'stderr'].forEach((name, i) => {
  const fd = ++i
  process[name]._writev = function _writev(chunks, cb) {
    const { chunk, encoding } = chunks.pop()
    write(fd, chunk, null, encoding, (err) => {
      if (err) cb(err)
      else if (chunks.length === 0) cb()
      else this._writev(chunks, cb)
    })
  }
})

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

export function resolve (specifier, context, nextResolve) {
  const { parentURL = null } = context;

  // Normally Node.js would error on specifiers starting with 'http', so
  // this hook intercepts them and converts them into absolute URLs to be
  // passed along to the later hooks below.
  if (specifier.startsWith('https:')) {
    return {
      shortCircuit: true,
      url: specifier
    }
  } else if (parentURL && parentURL.startsWith('https:')) {
    return {
      shortCircuit: true,
      url: new URL(specifier, parentURL).href,
    }
  } else if (specifier.startsWith('blob:')) {
    return {
      shortCircuit: true,
      url: specifier,
    }
  }

  // Let Node.js handle all other specifiers.
  return nextResolve(specifier, context, nextResolve);
}

export async function load(url, context, nextLoad) {
  // For JavaScript to be loaded over the network
  if (url.startsWith('https://')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: await fetch(url).then(r => r.text())
    }
  }

  if (url.includes('data:text/javascript;,"blob:nodedata:')) {
    const blobUrl = url.slice(-51, -1)

    // use broadcast channel to ask main thread to resolve blob
    bc.postMessage(blobUrl)
    const source = await new Promise(rs => {
      // Don't remove or or hell will break loose
      setTimeout(() => {}, 100)

      function listener (evt) {
        if (evt.data.url === blobUrl) {
          rs(evt.data.source)
          bc.removeEventListener('message', listener)
        }
      }

      bc.addEventListener('message', listener)
    })

    return {
      // This example assumes all network-provided JavaScript is ES module code.
      format: 'module',
      shortCircuit: true,
      source
    }
  }

  // Let Node.js handle all other URLs.
  return nextLoad(url, context, nextLoad);
}

const fetch = globalThis.fetch || async function fetch (url) {
  return new Promise((resolve, reject) => {
    get(url, res => {
      let out = ''
      res.on('data', chunk => out += chunk)
      res.on('end', () => resolve({ text: () => out }))
      res.on('error', reject)
    })
  })
}