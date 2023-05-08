import { writeFileSync } from 'node:fs'
import { resolveObjectURL } from 'node:buffer'
writeFileSync(new URL('./debug', import.meta.url), 'url:')

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
  const { parentURL = null } = context

  // Normally Node.js would error on specifiers starting with 'https://', so
  // this hook intercepts them and converts them into absolute URLs to be
  // passed along to the later hooks below.
  if (specifier.startsWith('https://') || specifier.startsWith('blob:')) {
    return {
      shortCircuit: true,
      url: specifier
    }
  } else if (parentURL && parentURL.startsWith('https://')) {
    return {
      shortCircuit: true,
      url: new URL(specifier, parentURL).href
    }
  }

  // Let Node.js handle all other specifiers.
  return nextResolve(specifier)
}

export async function load (url, context, nextLoad) {
  if (url.startsWith('blob:')) {
    // use broadcast channel to ask main thread to resolve blob
    bc.postMessage(url)
    const source = await new Promise(rs => {
      // Don't remove or or hell will break loose
      setTimeout(() => {}, 100)

      bc.addEventListener('message', evt => {
        if (evt.data.url === url) {
          rs(evt.data.source)
        }
      })
    })

    return {
      // This example assumes all network-provided JavaScript is ES module code.
      format: 'module',
      shortCircuit: true,
      source
    }
  }

  // For JavaScript to be loaded over the network, we need to fetch and return it.
  if (url.startsWith('https://')) {
    const source = await fetch(url).then(res => res.text())
    return {
      // This example assumes all network-provided JavaScript is ES module code.
      format: 'module',
      shortCircuit: true,
      source
    }
  }

  // Let Node.js handle all other URLs.
  return nextLoad(url)
}
