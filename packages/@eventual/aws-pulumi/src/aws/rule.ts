import { cloudwatch } from "@pulumi/aws";
import { ResourceOptions } from "@pulumi/pulumi";

export interface RuleProps extends cloudwatch.EventRuleArgs {}

export class Rule extends cloudwatch.EventRule {
  constructor(name: string, props: RuleProps, options?: ResourceOptions) {
    super(name, props, options);
  }
}
