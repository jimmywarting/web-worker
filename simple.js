import Worker from './node-worker.js'

const blob = new Blob([`
  console.log(123)
`], { type: 'text/javascript' })

const blobUrl = URL.createObjectURL(blob)

const worker = new Worker(blobUrl, { type: 'module' })

worker.addEventListener('message', evt => {
  console.log(evt.data)
})