import { Kind } from "./kind";

export declare function workflow<F extends (...args: any[]) => Promise<any>>(
  workflow: F
): F;

export declare namespace workflow {
  export const __kind: Kind.Workflow;
}
