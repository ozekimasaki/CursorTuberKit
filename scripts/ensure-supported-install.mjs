import { realpathSync } from "node:fs"
import path from "node:path"

const cursorSdkPath = path.resolve(process.cwd(), "node_modules", "@cursor", "sdk")

try {
  const resolvedPath =
    typeof realpathSync.native === "function" ? realpathSync.native(cursorSdkPath) : realpathSync(cursorSdkPath)
  const aubeSegment = `${path.sep}node_modules${path.sep}.aube${path.sep}`

  if (resolvedPath.includes(aubeSegment)) {
    console.error(`Unsupported Aube-installed node_modules layout detected.

This project no longer supports Aube-managed dependencies because native modules
like @cursor/sdk/sqlite3 can fail to load under Bun with:
  libstdc++.so.6: cannot open shared object file

Please clean the old install and reinstall with Bun:
  remove node_modules
  bun install`)
    process.exit(1)
  }
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    process.exit(0)
  }

  throw error
}
