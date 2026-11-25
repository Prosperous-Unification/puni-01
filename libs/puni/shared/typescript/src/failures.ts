import { defineException } from 'application-exception';

/**
 * The global types a doc-comment link needs read are not installed beside puni: `package` is
 * the one missing, which a link to `Bun` or `process` needs.
 */
export const GlobalTypesMissing = defineException({
  tag: 'puni/shared-typescript/GlobalTypesMissing',
  message: ({ package: missing }: { package: string }) =>
    `the global types of ${missing} are not installed beside puni; reinstall puni with its dependencies`,
});
