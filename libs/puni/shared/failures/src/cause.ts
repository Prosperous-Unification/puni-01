/** The text a caught value gives for a message: an error's message, anything else as a string. */
export function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
