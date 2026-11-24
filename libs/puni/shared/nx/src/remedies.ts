/** What to do about a project whose `metadata.readFirst` names no file to read first. */
export const readFirstRemedy =
  'set metadata.readFirst to the path, relative to the project, of the file to read first';

/** What to do about a project with no place in the map. */
export const scopeRemedy =
  'give the project exactly one tag scope:<name>, <name> lower-case letters, digits and hyphens, the partition that lists it; or set metadata.index to its partition path as an array of such segments';
