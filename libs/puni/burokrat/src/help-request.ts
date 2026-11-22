/** A bare group or sub-group: print the help of `path`, the sub-group path below `burokrat`. */
export interface HelpRequest {
  readonly kind: 'help';
  readonly path: readonly string[];
}
