import type { aws_iam, aws_lambda } from "aws-cdk-lib";
import type { SearchIndex, SearchIndexProps } from "./search-index";
import type { ServerlessSearchServiceProps } from "./serverless-search-service";
import type { ServerfulSearchService } from "./serverful-search-service";
import type { AccessOptions } from "./access-policy";
import type { ServiceConstructProps } from "../service";

export type SearchServiceOverrides =
  | ({
      serverless: true;
    } & Partial<
      Omit<ServerlessSearchServiceProps, keyof ServiceConstructProps>
    >)
  | ({
      serverless: false;
    } & Partial<Omit<ServerfulSearchService, keyof ServiceConstructProps>>);

export interface SearchService {
  readonly endpoint: string;
  readonly customResourceHandler: aws_lambda.IFunction;
  addIndex(props: SearchIndexProps): SearchIndex;
  grantControl(principal: SearchPrincipal): void;
  grantReadWrite(principal: SearchPrincipal, options?: AccessOptions): void;
  grantRead(principal: SearchPrincipal, options?: AccessOptions): void;
  grantWrite(principal: SearchPrincipal, options?: AccessOptions): void;
}

/**
 * A Search principal can only be a Role ARN or a SAML ARN.
 */
export type SearchPrincipal = aws_iam.IRole | aws_iam.SamlPrincipal;
