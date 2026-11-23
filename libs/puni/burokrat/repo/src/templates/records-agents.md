# {{name}}-records

Records for `{{name}}`: its past and its future. The system-state repository
says what the system is now; everything else is filed here. This repository is
private.

## Working here

- `{{name}}`, cloned beside this repository, is where work starts and where
  `puni.json` lists both repositories. The gate for this one is
  `puni burokrat check --repo system-records`, run from `../{{name}}`.
  Run it before you push.

## Layout

Records are filed by kind. A directory appears with its first record; add
no directory that is not named here.

- `nav/`: what is intended or being weighed. `plans/`, `research/`.
- `bur/`: what was decided, measured or retired. `adr/` holds decisions that
  are hard to reverse, surprising, and had real alternatives, with the options
  they rejected, `assessments/` holds measured results and run output worth
  keeping, `archive/` holds material retired from `{{name}}`.
- `dash/`: what running development and operations needs now, in any
  format.

## Rules

1. **One record per file.** In `nav/` and `bur/` a record is Markdown, named
   `YYYY-MM-DD-short-title.md` by the UTC day it was written, and opens with
   front matter. The gate names every field that is missing or wrong.
2. **Records are not rewritten.** To change one, file a new record that names
   the old one in `supersedes`, and add `superseded-by` to the old one. That
   is the only edit a filed record takes. `dash/` is the exception: it is
   kept current, and progress on a plan is tracked there, not in the plan.
3. **Nothing flows back.** Record text is never copied into `{{name}}`, its
   commit messages, pull requests or issues. A decision reaches the system
   as a statement of what it is now.
4. **No secrets.** Credentials and keys stay out, private or not.
5. **Find by file name.** Open only what the task needs.
6. **Commit and push what you file.** Leave no uncommitted record behind.
