/** What to do about a project whose `metadata.readFirst` names no file to read first. */
export const readFirstRemedy =
  'set metadata.readFirst to the path, relative to the project, of the file to read first';

/** What to do about a project with no place in the map. */
export const scopeRemedy =
  'give the project exactly one tag scope:<name>, <name> lower-case letters, digits and hyphens, the partition that lists it; or set metadata.index to its partition path as an array of such segments';

/** What to do about a `project.json` that holds no JSON object. */
export const invalidJsonRemedy = 'make the file one valid JSON object, as Nx reads a project.json';

/** What to do about a `project.json` whose project has no name. */
export const nameRemedy = 'give the project a non-empty "name", the name Nx knows it by';

/** What to do about a workspace lacking `directory`, where it keeps its projects. */
export function missingDirectoryRemedy(directory: string): string {
  return `create ${directory}/: an Nx workspace (a repository with nx.json) keeps its projects in apps/ and libs/`;
}

/** How a project is given a deeper partition, as a remedy names it. */
export const nxPlacementHint = 'set metadata.index in its project.json to the deeper path';
