/**
 * A command is an action taken to start or emit something.
 *
 * Current: Schedule Activity
 * Future: Emit Signal, Start Workflow, etc
 */
export interface Command {
  seq: number;
  name: string;
  args: any[];
}
