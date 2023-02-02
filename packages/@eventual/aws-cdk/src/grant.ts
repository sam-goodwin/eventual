import type aws_iam from "aws-cdk-lib/aws-iam";

/**
 * A decorator that can be attached to grant methods so enable automatic de-duping.
 *
 * Meaning: if the grant is called twice on the same instance, then the grant is
 * only applied once.
 *
 * ```ts
 * export class Table {
 *   @grant()
 *   public grantRead(grantable: aws_iam.IGrantable) {
 *     // blah
 *   }
 * }
 * ```
 */
export function grant() {
  const alreadyGranted = new Set<any>();

  return function <Target>(
    _target: Target,
    _key: string,
    descriptor: TypedPropertyDescriptor<(grantable: aws_iam.IGrantable) => any>
  ) {
    const original = descriptor.value!;
    descriptor.value = function (
      this: Target,
      grantable: aws_iam.IGrantable
    ): void {
      if (!alreadyGranted.has(grantable.grantPrincipal)) {
        original.call(this, grantable.grantPrincipal);
        alreadyGranted.add(grantable);
      }
    };
    return descriptor;
  };
}
