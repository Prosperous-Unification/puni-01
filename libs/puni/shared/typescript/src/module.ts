import { DiBag } from 'di-bag';
import { createTypescriptSourceReaders } from './source-readers.resource';
import { createTypescriptCompiler } from './typescript-compiler.repository';

/**
 * The TypeScript and JavaScript source readers over the compiler this puni depends on, which
 * they load only when they first read a file; they need nothing from their host.
 */
export const typescriptModule = DiBag.createBuilder()
  .withServices({ typescriptCompiler: createTypescriptCompiler })
  .withServices({ typescriptSourceReaders: createTypescriptSourceReaders })
  .buildModule({
    exportedServiceKeys: ['typescriptSourceReaders'],
    moduleLabel: 'puni-shared-typescript',
  });
