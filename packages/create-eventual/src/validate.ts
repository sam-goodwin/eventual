const projectNameRegex = /^[A-Za-z-_0-9]+$/g;

export const validateProjectName = validateName("project");
export const validateServiceName = validateName("service");

export function validateName(type: string) {
  return (name: string): true | string =>
    name.match(projectNameRegex) !== null ||
    `${type} name must match ${projectNameRegex}`;
}

export function assertName(type: string, name: string) {
  const result = validateName(type)(name);
  if (typeof result === "string") {
    throw new Error(result);
  }
}
