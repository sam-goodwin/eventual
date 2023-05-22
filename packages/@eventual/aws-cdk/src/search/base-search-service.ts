import { aws_lambda_nodejs } from "aws-cdk-lib";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import path from "path";
import { SearchIndexProps, SearchIndex } from "./search-index";
import { ServiceConstructProps } from "../service";
import { SearchPrincipal, SearchService } from "./search-service";

export interface BaseSearchServiceProps extends ServiceConstructProps {}

export abstract class BaseSearchService
  extends Construct
  implements SearchService
{
  abstract readonly endpoint: string;

  abstract grantReadWrite(principal: SearchPrincipal): void;
  abstract grantRead(principal: SearchPrincipal): void;
  abstract grantWrite(principal: SearchPrincipal): void;

  readonly customResourceHandler;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.customResourceHandler = new aws_lambda_nodejs.NodejsFunction(
      this,
      "IndexCreator",
      {
        entry: path.join(__dirname, "search-custom-resource", "index.js"),
        handler: "index.handle",
        memorySize: 512,
        runtime: Runtime.NODEJS_18_X,
      }
    );
  }

  public addIndex(props: SearchIndexProps) {
    return new SearchIndex(this, props.indexName, props);
  }
}
