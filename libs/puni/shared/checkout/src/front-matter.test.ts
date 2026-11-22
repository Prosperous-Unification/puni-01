import { describe, expect, test } from 'bun:test';
import { parseFrontMatter } from './front-matter';

describe('parseFrontMatter', () => {
  test('reads each key: value line between the opening --- lines, values trimmed, in order', () => {
    expect(parseFrontMatter('---\ntitle:  Deploy \r\nread-when: deploying\n---\nbody\n')).toEqual({
      fields: [
        { key: 'title', value: 'Deploy' },
        { key: 'read-when', value: 'deploying' },
      ],
    });
  });

  test.each(['# Deploy\n', '---\ntitle: Deploy\n', '\n---\ntitle: Deploy\n---\n'])(
    '%j has none: absent',
    (text) => {
      expect(parseFrontMatter(text)).toEqual({ problem: 'absent' });
    },
  );

  test('a line that is not key: value is malformed and named', () => {
    expect(parseFrontMatter('---\ntitle: Deploy\njust words\n---\n')).toEqual({
      problem: 'malformed',
      line: 'just words',
    });
  });
});
