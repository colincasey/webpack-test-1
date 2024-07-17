const { getHeapStatistics } = require('v8')
const { memoryUsage } = require('process')
const workerThreads = require('worker_threads')

const initialHeapStats = getHeapStatistics()

const timeout  = setInterval(() => {
    const mem = memoryUsage()
    const stat = {
        id: workerThreads.isMainThread ? 0 : workerThreads.threadId,
        timestamp: Date.now()
    }
    Object.assign(stat, {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        heapLimit: initialHeapStats.heap_size_limit,
    })

    console.log(JSON.stringify(stat))
}, 100)

if ('unref' in timeout) {
    timeout.unref()
}
