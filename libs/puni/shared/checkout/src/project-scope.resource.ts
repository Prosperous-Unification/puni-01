import { compareBytes } from './byte-order';
import type { CheckoutFiles, ProjectScopeResource } from './contract';
import { ProjectNameShared, ProjectUnknown, RootProjectMissing } from './failures';
import { type Project, repositoryScope } from './ownership';
import { nameProject, readProjectFiles } from './project-files';

function listProjects(files: CheckoutFiles): Project[] {
  const projects = readProjectFiles(files, repositoryScope).flatMap((file) => {
    const name = nameProject(file);
    return name === undefined ? [] : [{ name, directory: file.directory }];
  });
  for (const [index, project] of projects.entries()) {
    const twin = projects.findIndex((other) => other.name === project.name);
    if (twin !== index) {
      throw new ProjectNameShared({
        details: {
          rule: 'repository.projects',
          path: `${project.directory}/project.json`,
          name: project.name,
          first: projects[twin]?.directory ?? '',
          second: project.directory,
        },
      });
    }
  }
  return projects.sort((left, right) => compareBytes(left.directory, right.directory));
}

/** The {@link ProjectScopeResource}. */
export function createProjectScope(): ProjectScopeResource {
  return {
    list: listProjects,
    resolve(files, name) {
      const projects = listProjects(files);
      if (!projects.some((project) => project.directory === '.')) {
        throw new RootProjectMissing({
          details: { rule: 'repository.projects', path: 'project.json' },
        });
      }
      const project = projects.find((candidate) => candidate.name === name);
      if (project === undefined) {
        const known = projects.map((candidate) => candidate.name).join(', ');
        throw new ProjectUnknown({ details: { name, known } });
      }
      return { kind: 'project', project, projects };
    },
  };
}
