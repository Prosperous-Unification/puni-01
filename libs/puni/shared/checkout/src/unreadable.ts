import { describeCause } from '@puni/shared-failures';
import { FileUnreadable } from './failures';

/**
 * The text `read` gives for the file at `path`.
 *
 * @throws FileUnreadable naming `path`, with the runtime's error as its cause, when `read` throws.
 */
export function readOrRefuse(path: string, read: () => string): string {
  try {
    return read();
  } catch (cause) {
    throw new FileUnreadable({ details: { path, reason: describeCause(cause) }, cause });
  }
}
