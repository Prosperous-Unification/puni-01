import { constant, message, object, option, optional, string } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { CreatedRepository, RepoInitRequest, RepositoryPairSetup } from './contract';

/** `init --name NAME [--owner OWNER]`: the governed pair to create here and beside here. */
export const initParser = object({
  kind: constant('repo init'),
  name: option('--name', string({ metavar: 'NAME' }), {
    description: message`The system's name: its GitHub repository, beside it NAME-records.`,
  }),
  owner: optional(
    option('--owner', string({ metavar: 'OWNER' }), {
      description: message`The GitHub owner of both (default: the owner of puni's own repository).`,
    }),
  ),
});

/** The commands that make `repository` a pushed GitHub repository, one per line. */
function listNextSteps(repository: CreatedRepository): string[] {
  const git = `git -C ${repository.root}`;
  return [
    ...(repository.hasGit ? [] : [`  ${git} init`]),
    `  ${git} add -A && ${git} commit -m 'Start'`,
    `  ${git} remote add origin ${repository.url}.git && ${git} push -u origin HEAD`,
  ];
}

/**
 * The `repo init` command: creates the system-state repository in the current directory and its
 * records repository beside it, prints each created directory and the next steps (`git init`
 * where needed, creating the two GitHub repositories, pushing), and returns 0; it runs no git and
 * reaches no network. A refused name or owner, a directory holding anything but `.git`, or a
 * records directory that exists prints one `error: ` line and returns 2; a source checkout that
 * cannot be read one `error: ` line and 1.
 */
export function createRepoInitCommand({
  repositoryPairSetup,
}: {
  repositoryPairSetup: RepositoryPairSetup;
}): Command<RepoInitRequest> {
  return {
    run(request, io) {
      const outcome = repositoryPairSetup.init(io.cwd, request);
      switch (outcome.kind) {
        case 'created': {
          const { state, records } = outcome;
          io.stdout(
            [
              `created system-state ${state.root}`,
              `created system-records ${records.root}`,
              `next: create ${state.url} and ${records.url} (private) on GitHub, then:`,
              ...listNextSteps(state),
              ...listNextSteps(records),
              '',
            ].join('\n'),
          );
          return 0;
        }
        case 'refused':
          io.stderr(`error: ${outcome.reason}\n`);
          return 2;
        case 'defective':
          io.stderr(`error: ${outcome.reason}\n`);
          return 1;
      }
    },
  };
}
