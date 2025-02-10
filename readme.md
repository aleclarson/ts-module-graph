# ts-module-graph

A modest package for constructing a module graph from TypeScript source files.

## Install

```
pnpm add ts-module-graph
```

## Usage

```ts
import { createModuleGraph } from 'ts-module-graph'
import path from 'node:path'

// The entry points must be absolute paths.
const moduleGraph = await createModuleGraph([path.resolve('src/index.ts')])

// The module graph is a Map of ts.SourceFile objects to ModuleGraphNode objects.
console.log(moduleGraph)
```

### ModuleGraphNode

Each source file has a `ModuleGraphNode` object associated with it. Each node has the following properties:

- `imports`: An array of import objects, each containing information about an import statement.
  - `id`: The module specifier text (e.g. 'lodash', './my-module')
  - `importSpecifiers`: An array of `ImportSpecifier` objects, representing the individual elements being imported.
  - `resolvedImports`: An array of `ResolvedImport` objects, providing semantic information about the resolved imports.
  - `resolvedModule`: A `ts.ResolvedModuleFull` object, containing information about the resolved module, if available.
- `dependencies`: A Set of `ts.SourceFile` objects, representing the direct dependencies of this module.

### ResolvedImport

Each import resolution has the following properties:

- `kind`: The kind of import specifier (e.g. 'name', 'namespace', 'default').
- `name`: The `ts.Identifier` representing the imported name.
- `exportName`: The `ts.ModuleExportName` representing the original exported name, if different from the imported name.
- `symbol`: The `ts.Symbol` associated with the imported entity.
- `aliasedSymbol`: The original `ts.Symbol` if the imported symbol is an alias.
- `declarations`: An array of `ts.Declaration` objects where the imported symbol is declared.

### ImportSpecifier

Each import specifier has the following properties:

- `kind`: The kind of import specifier. Can be:
  - `'name'`: A named import (e.g. `{ foo }`)
    - `name`: The `ts.ModuleExportName` representing the imported name.
    - `alias`: An optional `ts.Identifier` representing the alias used for the import (e.g. `{ foo as bar }`).
  - `'namespace'`: A namespace import (e.g. `* as foo`)
    - `name`: The `ts.Identifier` representing the namespace.
  - `'default'`: A default import (e.g. `foo`)
    - `name`: The `ts.Identifier` representing the default import.

## Roadmap

Contribution is welcome to implement these features:

- [ ] Namespace imports should have their usage tracked to determine which symbols are actually used.
- [ ] Add a tree-shaking API that whittles down the module graph to only the necessary modules. It doesn't need to be fine-grained; i.e. just filter out modules not used by the entry points (directly or indirectly).

## Command-line API

```
ts-module-graph <...entries>
```

The entry points are resolved relative to the current working directory. Globs are supported.

This command will print the flattened module graph to the console, using colorization to help with readability.

## Thanks

This project wouldn't be possible without these amazing dependencies:

- [tsc-extra](https://github.com/alien-rpc/alien-rpc/tree/master/packages/tsc-extra) - For providing a clean API to work with TypeScript's compiler API
- [ts-expose-internals](https://github.com/nonara/ts-expose-internals) - For exposing TypeScript's internal types
