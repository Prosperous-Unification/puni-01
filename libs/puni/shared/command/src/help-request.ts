/** A bare group or sub-group: print the help of `path`, the sub-group path below the group. */
export interface HelpRequest {
  readonly kind: 'help';
  readonly path: readonly string[];
}
