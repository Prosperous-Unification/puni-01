import { constant, message, object, option } from '@optique/core';
import { explainDefect, type RepositoryRegistryResource } from '@puni/shared-checkout';
import type { Command } from '@puni/shared-command';
import { ReviewTemplateFailed, type ReviewTemplates } from '@puni/shared-records';
import type { TemplatesRequest } from './contract';

/** `templates [--json]`: available assessment criteria maps and their versions. */
export const templatesParser = object({
  kind: constant('assess templates'),
  json: option('--json', { description: message`Print template references as JSON.` }),
});

/** Lists the available templates, or reports an unreadable repository or catalog and exits 1. */
export function createTemplatesCommand({
  checkoutRegistry,
  reviewTemplates,
}: {
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly reviewTemplates: ReviewTemplates;
}): Command<TemplatesRequest> {
  return {
    run(request, io) {
      try {
        const state = checkoutRegistry.resolve(checkoutRegistry.locate(io.cwd), 'system-state');
        const templates = reviewTemplates.list(state.root);
        io.stdout(
          request.json
            ? `${JSON.stringify(templates)}\n`
            : templates.map(({ id, version }) => `${id}@${version}\n`).join(''),
        );
        return 0;
      } catch (cause) {
        const reason = cause instanceof ReviewTemplateFailed ? cause.message : explainDefect(cause);
        if (reason === undefined) throw cause;
        io.stderr(`error: ${reason}\n`);
        return 1;
      }
    },
  };
}
