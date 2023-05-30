import { ENV_NAMES } from "@eventual/aws-runtime";
import type { IndexSpec } from "@eventual/core/internal";
import type { Function } from "aws-cdk-lib/aws-lambda";
import * as aws_lambda from "aws-cdk-lib/aws-lambda";
import { Duration, Lazy } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import type { ServiceConstructProps } from "../service";
import type { ServiceEntityProps } from "../utils";
import { SearchIndex } from "./search-index";
import type {
  SearchPrincipal,
  SearchService,
  ServiceIndices,
} from "./search-service";

export type SearchIndexOverrides<Service> = ServiceEntityProps<
  Service,
  "SearchIndex",
  Partial<Omit<IndexSpec, "index" | "mappings">>
>;

export interface BaseSearchServiceProps<Service> extends ServiceConstructProps {
  indices?: SearchIndexOverrides<Service>;
}

/**
 * Base Construct for the {@link SearchService} implementation in Eventual.
 *
 * It handles the creation of the Custom Resource for managing indices on
 * the cluster and provisions all of the indices discovered in the Eventual
 * application.
 */
export abstract class BaseSearchService<Service>
  extends Construct
  implements SearchService<Service>
{
  /**
   * The OpenSearch cluster's HTTPS endpoint
   */
  public abstract readonly endpoint: string;
  /**
   * Lambda Function that handles all Custom Resource requests for managing the Cluster.
   *
   * e.g. creating Indices
   */
  public readonly customResourceHandler;
  /**
   * Key-value of all the indices
   */
  public readonly indices: ServiceIndices<Service>;
  /**
   * Construct that is the root of the tree containing all Index Custom Resources
   */
  private readonly indexRoot: Construct;

  constructor(props: BaseSearchServiceProps<Service>) {
    super(props.systemScope, "SearchService");

    this.indexRoot = new Construct(props.serviceScope, "Indices");
    this.customResourceHandler = new aws_lambda.Function(
      this,
      "CustomResourceHandler",
      {
        runtime: aws_lambda.Runtime.NODEJS_18_X,
        handler:
          props.build.system.searchService.customResourceHandler.handler ??
          "index.default",
        code: props.build.getCode(
          props.build.system.searchService.customResourceHandler.entry
        ),
        environment: {
          OS_ENDPOINT: Lazy.string({
            produce: () => this.endpoint,
          }),
        },
        memorySize: 512,
        timeout: Duration.minutes(1),
      }
    );

    this.indices = Object.fromEntries(
      props.build.search.indices.map((index) => {
        const overrides =
          props.indices?.[index.index as keyof typeof props.indices];
        const spec: IndexSpec = {
          ...index,
          ...(overrides ?? {}),
          settings: {
            ...index.settings,
            ...(overrides?.settings ?? {}),
          },
          aliases: {
            ...index.aliases,
            ...(overrides?.aliases ?? {}),
          },
        };
        return [
          index.index,
          new SearchIndex(this.indexRoot, spec.index, {
            searchService: this,
            spec,
          }),
        ];
      })
    ) as ServiceIndices<Service>;
  }

  public abstract grantControl(principal: SearchPrincipal): void;
  public abstract grantReadWrite(principal: SearchPrincipal): void;
  public abstract grantRead(principal: SearchPrincipal): void;
  public abstract grantWrite(principal: SearchPrincipal): void;

  public configureSearch(func: Function) {
    this.grantReadWrite(func.role!);
    func.addEnvironment(ENV_NAMES.OPENSEARCH_ENDPOINT, this.endpoint);
  }
}
