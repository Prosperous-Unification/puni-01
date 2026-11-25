import type { Member, Members, OwnMembers, RawTopLevel, TopLevel } from './declarations';

/**
 * The top-level names of `raw`, each shape's members joined by those of each base it extends
 * that the file declares at the top level, outside a global block: closed only when every base
 * is such a closed shape, so an inherited member of another file's base can be anything. Each
 * base is resolved once and a member listed once, so a diamond of bases costs what a chain does.
 */
export function inherit(raw: readonly RawTopLevel[]): TopLevel[] {
  const byName = new Map<string, OwnMembers[]>();
  for (const { name, own, global } of raw) {
    if (!global) byName.set(name, [...(byName.get(name) ?? []), own]);
  }
  const resolved = new Map<string, Members>();
  const resolving = new Set<string>();
  const resolveOwn = (own: OwnMembers): Members => {
    const listed = [...own.listed];
    const seen = new Set<Member>(listed);
    let closed = own.closed;
    for (const base of own.bases) {
      const inherited = base === undefined ? undefined : resolveName(base);
      if (inherited === undefined) {
        closed = false;
        continue;
      }
      for (const member of inherited.listed) {
        if (!seen.has(member)) listed.push(member);
        seen.add(member);
      }
      closed &&= inherited.closed;
    }
    return { listed, closed, callable: own.callable };
  };
  /** The members of every top-level shape named `name` joined, once per name; none in a cycle. */
  const resolveName = (name: string): Members | undefined => {
    const known = resolved.get(name);
    if (known !== undefined) return known;
    const parts = byName.get(name);
    if (parts === undefined || resolving.has(name)) return undefined;
    resolving.add(name);
    const members = parts.map(resolveOwn);
    resolving.delete(name);
    const joined = {
      listed: members.flatMap(({ listed }) => listed),
      closed: members.every(({ closed }) => closed),
      callable: members.some(({ callable }) => callable),
    };
    resolved.set(name, joined);
    return joined;
  };
  return raw.map(({ own, ...rest }) => {
    resolving.add(rest.name);
    const members = resolveOwn(own);
    resolving.delete(rest.name);
    return { ...rest, members };
  });
}
