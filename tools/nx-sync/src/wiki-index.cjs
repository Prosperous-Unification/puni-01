const { execFileSync } = require('node:child_process');

/**
 * The part of an Nx tree the generator uses.
 *
 * @typedef {object} IndexTree
 * @property {string} root the workspace root
 * @property {(path: string) => boolean} exists whether a file or directory is at the path
 * @property {(path: string, encoding: 'utf8') => string | null} read the text of the file
 * @property {(path: string, text: string) => void} write writes the file
 * @property {(path: string) => void} delete deletes the file
 * @property {(path: string) => boolean} isFile whether the path is a file
 * @property {(path: string) => string[]} children the names in the directory
 */

/** The generated directory the generator owns. */
const indexDirectory = 'wiki/index';

/** The program and arguments that print the index as one JSON object, path to content. */
const printProgram = 'bun';
const printArguments = ['apps/puni/cli/src/entrypoint.ts', 'burokrat', 'wiki', 'index', '--print'];
const printCommand = [printProgram, ...printArguments].join(' ');

/**
 * Runs `puni burokrat wiki index --print` in `root` and returns what it printed.
 *
 * @param {string} root the workspace root
 * @returns {string} the printed JSON
 * @throws Error naming the command and its stderr when it cannot run or exits non-zero
 */
function printIndex(root) {
  try {
    return execFileSync(printProgram, printArguments, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    const stderr =
      typeof cause === 'object' && cause !== null && 'stderr' in cause ? String(cause.stderr) : '';
    throw new Error(`${printCommand} failed: ${stderr.trim()}`, { cause });
  }
}

/**
 * The files `printed` maps, each path to its content.
 *
 * @param {string} printed the JSON the command printed
 * @returns {Map<string, string>} the rendered files
 * @throws Error when it is not one JSON object of strings under the index directory
 */
function readRendered(printed) {
  /** @type {unknown} */
  const parsed = JSON.parse(printed);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${printCommand} printed no JSON object`);
  }
  /** @type {Map<string, string>} */
  const rendered = new Map();
  for (const [path, text] of Object.entries(parsed)) {
    if (typeof text !== 'string' || !path.startsWith(`${indexDirectory}/`)) {
      throw new Error(`${printCommand} printed ${path}, not a file of ${indexDirectory}/`);
    }
    rendered.set(path, text);
  }
  return rendered;
}

/**
 * Every file below `directory` in `tree`.
 *
 * @param {IndexTree} tree the Nx tree
 * @param {string} directory the directory to walk
 * @returns {string[]} the file paths
 */
function listFiles(tree, directory) {
  return tree.children(directory).flatMap((name) => {
    const path = `${directory}/${name}`;
    return tree.isFile(path) ? [path] : listFiles(tree, path);
  });
}

/**
 * Makes `wiki/index/` in `tree` exactly what `printed` renders: deletes a file standing where the
 * directory belongs, writes each file that differs and deletes every other file below it, naming
 * each change in the message Nx prints.
 *
 * @param {IndexTree} tree the Nx tree
 * @param {string} printed the JSON `puni burokrat wiki index --print` printed
 * @returns {{ outOfSyncMessage: string }} what Nx prints when the tree had to change
 */
function syncIndex(tree, printed) {
  const rendered = readRendered(printed);
  /** @type {string[]} */
  const changes = [];
  if (tree.exists(indexDirectory) && tree.isFile(indexDirectory)) {
    tree.delete(indexDirectory);
    changes.push(`${indexDirectory} is not generated`);
  }
  for (const [path, text] of rendered) {
    const exists = tree.exists(path);
    if (exists && tree.read(path, 'utf8') === text) continue;
    tree.write(path, text);
    changes.push(`${path} ${exists ? 'is stale' : 'is missing'}`);
  }
  for (const path of listFiles(tree, indexDirectory)) {
    if (rendered.has(path)) continue;
    tree.delete(path);
    changes.push(`${path} is not generated`);
  }
  return {
    outOfSyncMessage: `${changes.join('; ')}; run \`bun run fix\``,
  };
}

/**
 * The Nx sync generator `@puni/nx-sync:wiki-index`: keeps `wiki/index/` as
 * `puni burokrat wiki index --print` renders it. A failing command throws, so `nx sync:check`
 * fails rather than passing on a stale index.
 *
 * @param {IndexTree} tree the Nx tree
 * @returns {Promise<{ outOfSyncMessage: string }>} what Nx prints when the tree had to change
 */
async function syncWikiIndex(tree) {
  return syncIndex(tree, printIndex(tree.root));
}

module.exports = Object.assign(syncWikiIndex, { syncIndex });
