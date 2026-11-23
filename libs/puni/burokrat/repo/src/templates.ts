import recordsAgents from './templates/records-agents.md' with { type: 'text' };
import stateAgents from './templates/state-agents.md' with { type: 'text' };
import stateReadme from './templates/state-readme.md' with { type: 'text' };
import { TemplatePlaceholderUnfilled } from './failures';

/**
 * The texts a new repository pair starts with, each a template of the `{{placeholder}}`s `name`
 * and `recordsUrl`. The state `AGENTS.md` is its template, a blank line, then the rules section
 * copied whole, so the section ends the file exactly as the source holds it.
 */
export const templates = { recordsAgents, stateAgents, stateReadme } as const;

/** The `.gitignore` both new repositories start with: the files of editors and the desktop. */
export const newGitignore = '.DS_Store\n.idea/\n';

/**
 * `template` with each `{{key}}` replaced by `values[key]`; a value is inserted as it is, never
 * read for placeholders itself.
 *
 * @throws TemplatePlaceholderUnfilled when a placeholder has no value.
 */
export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{([a-zA-Z]+)\}\}/gu, (_match, key: string) => {
    const value = values[key];
    if (value === undefined)
      throw new TemplatePlaceholderUnfilled({ details: { placeholder: key } });
    return value;
  });
}
