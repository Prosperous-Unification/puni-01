/** One segment of a partition path: a lower-case letter, then lower-case letters, digits and hyphens. */
export const partitionSegmentPattern = /^[a-z][a-z0-9-]*$/u;

/**
 * Whether `path` names a partition of the map: one or more {@link partitionSegmentPattern}
 * segments joined by `/`, as `dash` and `dash/ops` are.
 */
export function isPartitionPath(path: string): boolean {
  return path.split('/').every((segment) => partitionSegmentPattern.test(segment));
}
