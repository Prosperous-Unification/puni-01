import { describe, expect, test } from 'bun:test';
import { runCommand } from './cli';
import { type Group, readInvocation } from './cli-parser';

function collect(run: (stdout: (text: string) => void) => unknown): string {
  let printed = '';
  run((text) => {
    printed += text;
  });
  return printed;
}

describe('runCommand', () => {
  test.each<Group>(['navigator', 'dash', 'burokrat'])(
    'a bare %s prints its group help and exits 0',
    (group) => {
      let code: number | undefined;
      const printed = collect((stdout) => {
        code = runCommand({ group, request: {} }, stdout);
      });
      expect(code).toBe(0);
      expect(printed).toBe(collect((stdout) => readInvocation([group, '--help'], stdout)));
    },
  );
});
