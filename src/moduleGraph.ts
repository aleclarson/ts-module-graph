import fs from 'node:fs'
import path from 'node:path'
import { min } from 'radashi'
import { createProjectFactory } from 'tsc-extra'
import type ts from 'typescript'
import { BadEntryError } from './errors.ts'

export async function createModuleGraph(entries: string[]) {
  if (!entries.length) {
    throw new BadEntryError('No entries provided')
  }
  for (const entry of entries) {
    if (!path.isAbsolute(entry)) {
      throw new BadEntryError(`Entry must be an absolute path: ${entry}`)
    }
  }

  const rootDir = findCommonDirectory(entries, dir => {
    const children = fs.readdirSync(dir)
    return children.some(child => {
      return child === 'tsconfig.json' || child === '.git'
    })
  })

  if (!rootDir) {
    throw new BadEntryError(
      'Entries must share a common directory containing tsconfig.json or .git'
    )
  }

  const createProject = createProjectFactory(
    (project, options, ts: typeof import('typescript')) => {
      return {
        ts,
        resolveModuleName(id: string, importer: string) {
          return ts.resolveModuleName(
            id,
            importer,
            project.compilerOptions,
            project.getModuleResolutionHost()
          )
        },
      }
    }
  )

  const project = await createProject(rootDir, {
    skipAddingFilesFromTsConfig: true,
  })

  for (const entry of entries) {
    project.addSourceFileAtPath(entry)
  }

  project.resolveSourceFileDependencies()

  const { ts } = project
  const typeChecker = project.getTypeChecker()

  const moduleGraph = new Map() as ModuleGraph
  moduleGraph.rootDir = rootDir

  const resolveImports = (sourceFile: ts.SourceFile): ModuleGraphNode => {
    let result = moduleGraph.get(sourceFile)
    if (result) {
      return result
    }

    result = {
      imports: [],
      dependencies: new Set(),
    }
    moduleGraph.set(sourceFile, result)

    for (const moduleSpecifier of sourceFile.imports) {
      const { resolvedModule } = project.resolveModuleName(
        moduleSpecifier.text,
        sourceFile.fileName
      )

      const importStmt = moduleSpecifier.parent as ts.ImportDeclaration
      const importSpecifiers = importStmt.importClause
        ? getImportSpecifiers(importStmt.importClause, project.ts)
        : []

      const resolvedImports = importSpecifiers.map(
        (specifier): ResolvedImport => {
          const symbol = typeChecker.getSymbolAtLocation(specifier.name)
          const aliasedSymbol =
            symbol && symbol.flags & ts.SymbolFlags.Alias
              ? typeChecker.getAliasedSymbol(symbol)
              : undefined

          return {
            kind: specifier.kind,
            name:
              specifier.kind === 'name'
                ? (specifier.alias ?? (specifier.name as ts.Identifier))
                : specifier.name,
            exportName: specifier.kind === 'name' ? specifier.name : undefined,
            symbol,
            aliasedSymbol,
            declarations: aliasedSymbol?.getDeclarations(),
          }
        }
      )

      if (resolvedModule) {
        const canTreeShake =
          resolvedImports.length > 0 &&
          resolvedImports.every(i => i.kind !== 'namespace')

        if (!canTreeShake) {
          const dependency = project.getSourceFileOrThrow(
            resolvedModule.resolvedFileName
          )
          if (dependency !== sourceFile) {
            result.dependencies.add(dependency)
          }
        }

        for (const { declarations } of resolvedImports) {
          declarations?.forEach(declaration => {
            const dependency = declaration.getSourceFile()
            if (dependency !== sourceFile) {
              result.dependencies.add(dependency)
            }
          })
        }
      }

      result.imports.push({
        id: moduleSpecifier.text,
        importSpecifiers,
        resolvedImports,
        resolvedModule,
      })
    }

    return result
  }

  const queue = new Set(
    entries.map(entry => project.getSourceFileOrThrow(entry))
  )
  queue.forEach(sourceFile => {
    const { dependencies } = resolveImports(sourceFile)
    for (const dependency of dependencies) {
      queue.add(dependency)
    }
  })

  return moduleGraph
}

export type ModuleGraph = Map<ts.SourceFile, ModuleGraphNode> & {
  rootDir: string
}

export type ModuleGraphNode = {
  imports: {
    id: string
    importSpecifiers: ImportSpecifier[]
    resolvedImports: ResolvedImport[]
    resolvedModule: ts.ResolvedModuleFull | undefined
  }[]
  dependencies: Set<ts.SourceFile>
}

export type ResolvedImport = {
  kind: ImportSpecifier['kind']
  name: ts.Identifier
  exportName: ts.ModuleExportName | undefined
  symbol: ts.Symbol | undefined
  aliasedSymbol: ts.Symbol | undefined
  declarations: ts.Declaration[] | undefined
}

export type ImportSpecifier =
  | { kind: 'name'; name: ts.ModuleExportName; alias?: ts.Identifier }
  | { kind: 'namespace'; name: ts.Identifier }
  | { kind: 'default'; name: ts.Identifier }

function getImportSpecifiers(
  clause: ts.ImportClause,
  ts: typeof import('typescript')
): ImportSpecifier[] {
  const specifiers: ImportSpecifier[] = []
  if (clause.name) {
    specifiers.push({ kind: 'default', name: clause.name })
  }
  if (clause.namedBindings?.kind === ts.SyntaxKind.NamedImports) {
    for (const element of clause.namedBindings.elements) {
      let name: ts.ModuleExportName
      let alias: ts.Identifier | undefined
      if (element.propertyName) {
        name = element.propertyName
        alias = element.name
      } else {
        name = element.name
      }
      specifiers.push({ kind: 'name', name, alias })
    }
  } else if (clause.namedBindings?.kind === ts.SyntaxKind.NamespaceImport) {
    specifiers.push({ kind: 'namespace', name: clause.namedBindings.name })
  }
  return specifiers
}

function findCommonDirectory(files: string[], test: (dir: string) => boolean) {
  if (!files.length) {
    return null
  }

  // Get array of parent directories for each path
  const dirArrays = files.map(file => {
    let { root, dir } = path.parse(file)
    const dirs: string[] = []
    while (true) {
      dirs.push(dir)
      if (dir === root) {
        break
      }
      dir = path.dirname(dir)
    }
    return dirs.reverse()
  })

  // Find shortest array
  const shortestArray = min(dirArrays, arr => arr.length)!

  // Starting from end, test each directory
  for (let i = shortestArray.length - 1; i >= 0; i--) {
    const dir = shortestArray[i]
    if (test(dir)) {
      return dir
    }
  }

  return null
}
