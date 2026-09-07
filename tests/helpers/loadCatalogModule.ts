import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import * as jsxRuntime from "react/jsx-runtime"

// Compile TSX in memory using React's automatic runtime, without starting Next.
// Every runtime dependency must be supplied explicitly: no DB/env/network imports.
export function loadCatalogModule<T>(path: string, dependencies: Record<string, unknown>): T {
  const fileName = resolve(path)
  const { outputText } = ts.transpileModule(readFileSync(fileName, "utf8"), {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  })
  const compiledModule = { exports: {} }
  const allowed: Record<string, unknown> = { "react/jsx-runtime": jsxRuntime, ...dependencies }
  const requireFake = (name: string): unknown => {
    if (!Object.hasOwn(allowed, name)) throw new Error("Unmocked dependency: " + name)
    return allowed[name]
  }
  runInNewContext(outputText, {
    module: compiledModule, exports: compiledModule.exports, require: requireFake,
  }, { timeout: 5000 })
  return compiledModule.exports as T
}
