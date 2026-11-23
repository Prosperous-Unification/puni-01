/** The subject GitHub gives the merge of a pull request: `Merge pull request #N from owner/branch`. */
const pullRequestMerge = /^Merge pull request #(\d+) from [^/\s]+\/(\S+)/u;

/** The pull request a merge's `subject` names and its head branch; none for any other subject. */
export function readMergeSubject(
  subject: string,
): { readonly pullRequest: number; readonly branch: string } | null {
  const match = pullRequestMerge.exec(subject);
  const [, number, branch] = match ?? [];
  if (number === undefined || branch === undefined) return null;
  return { pullRequest: Number(number), branch };
}
