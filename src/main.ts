import { cyan, gray, green, italic, magenta, red, yellow } from 'nanocolors'
import path from 'node:path'
import util from 'node:util'
import { globSync } from 'tinyglobby'
import { ControlledError } from './errors.ts'
import { isFile } from './helpers.ts'
import { createModuleGraph } from './moduleGraph.ts'

let { positionals: entries } = util.parseArgs({
  allowPositionals: true,
})

entries = entries.flatMap(f => {
  return isFile(f) ? path.resolve(f) : globSync(f, { absolute: true })
})

try {
  const moduleGraph = await createModuleGraph(entries)
  console.log(moduleGraph.rootDir)

  const fromKeyword = gray(italic('from'))
  const from = (name: string, color: (text: string) => string) =>
    fromKeyword + ' ' + color(name)

  const formatImportedPath = (
    resolvedFileName: string | undefined,
    id: string
  ) => {
    let importedPath: string
    let color: (text: string) => string
    if (!resolvedFileName) {
      importedPath = id
      color = red
    } else if (resolvedFileName.includes('node_modules')) {
      importedPath = id
      color = magenta
    } else if (isRelativeTo(moduleGraph.rootDir, resolvedFileName)) {
      importedPath = relative(moduleGraph.rootDir, resolvedFileName)
      color = green
    } else {
      importedPath = resolvedFileName
      color = yellow
    }
    return from(importedPath, color)
  }

  for (const [sourceFile, node] of moduleGraph) {
    const relativeFileName = relative(moduleGraph.rootDir, sourceFile.fileName)
    if (relativeFileName.startsWith('..')) {
      console.log(yellow(sourceFile.fileName))
    } else {
      console.log(cyan(relativeFileName))
    }
    for (const { id, resolvedImports, resolvedModule } of node.imports) {
      if (!resolvedImports.length) {
        console.log(
          '  ' + formatImportedPath(resolvedModule?.resolvedFileName, id)
        )
        continue
      }
      for (const { kind, exportName, declarations } of resolvedImports) {
        let name: string
        if (kind === 'name') {
          name = exportName!.text
        } else if (kind === 'default') {
          name = 'default'
        } else {
          name = '*'
        }
        console.log(
          '  ' +
            name +
            ' ' +
            formatImportedPath(declarations?.[0].getSourceFile().fileName, id)
        )
      }
    }
    console.log()
  }
} catch (error: any) {
  if (error instanceof ControlledError) {
    console.error(red('ERR'), error.message)
    process.exit(1)
  }
  throw error
}

function isRelativeTo(fromDir: string, to: string) {
  const result = path.relative(fromDir, to)
  return !result.startsWith('..')
}

function relative(fromDir: string, to: string) {
  const result = path.relative(fromDir, to)
  if (result.startsWith('..')) {
    return result
  }
  return './' + result
}
