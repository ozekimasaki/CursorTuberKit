import {
  getMemKraftContainerStatus,
  getMemKraftExecutionMode,
  prepareMemKraftContainer,
  stopMemKraftContainer,
} from "../server/memkraftContainer.js"

const command = process.argv[2]

if (!command || !["prepare", "start", "status", "stop"].includes(command)) {
  console.error("Usage: tsx scripts/memkraft.ts <prepare|start|status|stop>")
  process.exit(1)
}

try {
  if (command === "prepare" || command === "start") {
    const status = await prepareMemKraftContainer()

    if (status.executionMode === "local") {
      console.log("MemKraft is using local Python mode.")
    } else {
      console.log(`MemKraft container is ready via ${status.runtime}.`)
    }
  }

  if (command === "status") {
    const status = await getMemKraftContainerStatus()

    if (status.executionMode === "local") {
      console.log("MemKraft is using local Python mode.")
    } else if (status.running) {
      console.log(`MemKraft container is running via ${status.runtime}.`)
    } else if (status.imageReady) {
      console.log(`MemKraft image is built, but container is stopped (${status.runtime}).`)
    } else {
      console.log(`MemKraft image is not built yet (${status.runtime}).`)
    }
  }

  if (command === "stop") {
    const status = await stopMemKraftContainer()

    if (status.executionMode === "local") {
      console.log("MemKraft is using local Python mode.")
    } else {
      console.log("MemKraft container stopped.")
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "MemKraft container command failed.")
  process.exit(1)
}
