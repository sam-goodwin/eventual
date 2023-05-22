import { Lazy, aws_lambda_nodejs } from "aws-cdk-lib";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import path from "path";
import { SearchIndexProps, SearchIndex } from "./search-index";
import { ServiceConstructProps } from "../service";
import { SearchPrincipal, SearchService } from "./search-service";

export type BaseSearchServiceProps = ServiceConstructProps;

export abstract class BaseSearchService
  extends Construct
  implements SearchService
{
  public abstract readonly endpoint: string;

  public abstract grantControl(principal: SearchPrincipal): void;
  public abstract grantReadWrite(principal: SearchPrincipal): void;
  public abstract grantRead(principal: SearchPrincipal): void;
  public abstract grantWrite(principal: SearchPrincipal): void;

  public readonly customResourceHandler;

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
        environment: {
          OS_ENDPOINT: Lazy.string({
            produce: () => this.endpoint,
          }),
        },
      }
    );
  }

  public addIndex(props: SearchIndexProps) {
    return new SearchIndex(this, props.indexName, props);
  }
}
