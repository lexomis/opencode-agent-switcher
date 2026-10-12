import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { transformAsync } from '@babel/core';
import typescript from '@babel/preset-typescript';
import solid from 'babel-preset-solid';
import { build } from 'esbuild';

// Compile reactive JSX for OpenTUI; keep host runtime packages external.
await build({
  entryPoints: {
    index: './src/agent-priority-core.ts',
    tui: './src/agent-priority-tui.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outdir: './dist',
  packages: 'external',
  plugins: [
    {
      name: 'opentui-solid',
      setup(builder) {
        builder.onLoad({ filter: /\.tsx$/ }, async ({ path }) => {
          const result = await transformAsync(await readFile(path, 'utf8'), {
            filename: path,
            configFile: false,
            babelrc: false,
            presets: [[solid, { moduleName: '@opentui/solid', generate: 'universal' }], typescript],
          });
          if (!result?.code) throw new Error(`Failed to compile ${path}`);
          return { contents: result.code, loader: 'js', resolveDir: dirname(path) };
        });
      },
    },
  ],
  logLevel: 'info',
});
