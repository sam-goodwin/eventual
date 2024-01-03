import type aws_iam from "aws-cdk-lib/aws-iam";
import type aws_lambda from "aws-cdk-lib/aws-lambda";
import type { Function } from "aws-cdk-lib/aws-lambda";
import type { ServiceConstructProps } from "../service-common.js";
import type { ServiceEntityProps } from "../utils.js";
import type { AccessOptions } from "./data-access-policy.js";
import type { SearchIndex } from "./search-index.js";
import type { ServerfulSearchServiceProps } from "./serverful-search-service.js";
import type { ServerlessSearchServiceProps } from "./serverless-search-service.js";

/**
 * Properties that override the configuration of the {@link SearchService} within
 * an Eventual {@link Service}.
 */
export type SearchServiceOverrides<Service> =
  | ({
      /**
       * Enable Serverless. This will switch to using an OpenSearch {@link Collection}
       * instead of a Domain. A {@link Collection} requires less operational management
       * but comes with a high premium minimum cost
       */
      serverless: true;
    } & Partial<
      Omit<ServerlessSearchServiceProps<Service>, keyof ServiceConstructProps>
    >)
  | ({
      /**
       * Serverless is disabled by default because of the minimum $700/mo cost.
       *
       * For developer environments, we provision a Domain that is free under
       * the free tier, or ~$25/mo minimum cost.
       */
      serverless?: false;
    } & Partial<
      Omit<ServerfulSearchServiceProps<Service>, keyof ServiceConstructProps>
    >);

/**
 * The Search Service provides powerful search and analysis capabilities via
 * the OpenSearch offerings available on AWS.
 */
export interface SearchService<Service = any> {
  /**
   * Dictionary containing all of the indices
   */
  readonly indices: ServiceIndices<Service>;
  /**
   * The OpenSearch cluster endpoint.
   */
  readonly endpoint: string;
  /**
   * Lambda Function that handles all Custom Resource lifecycle events.
   */
  readonly customResourceHandler: aws_lambda.IFunction;
  /**
   * Grant permission to control this OpenSearch cluster.
   */
  grantControl(principal: SearchPrincipal): void;
  /**
   * Grant permission to read and write data in this OpenSearch cluster.
   */
  grantReadWrite(principal: SearchPrincipal, options?: AccessOptions): void;
  /**
   * Grant permission to read data from this OpenSearch cluster.
   */
  grantRead(principal: SearchPrincipal, options?: AccessOptions): void;
  /**
   * Grant permission to write data to this OpenSearch cluster.
   */
  grantWrite(principal: SearchPrincipal, options?: AccessOptions): void;
  /**
   * Configure the {@link func} with the Open Search cluster's endpoint.
   */
  configureSearch(func: Function): void;
}

/**
 * A Search principal can only be a Role ARN or a SAML ARN.
 */
export type SearchPrincipal = aws_iam.IRole | aws_iam.SamlPrincipal;

export type ServiceIndices<Service> = ServiceEntityProps<
  Service,
  "SearchIndex",
  SearchIndex
>;
