import { Service as CDKService } from "@eventual/aws-cdk";
import { Bridge } from "pulumi-cdk-classic";

/**
 * Bridges the AWS CDK {@link CDKService} into the Pulumi ecosystem.
 */
export class Service extends Bridge(CDKService) {}
