import { sanitizeCollectionName } from "@eventual/aws-runtime";
import type { IRole } from "aws-cdk-lib/aws-iam";
import { RemovalPolicy } from "aws-cdk-lib/core";
import { grant } from "../grant.js";
import {
  BaseSearchService,
  BaseSearchServiceProps,
} from "./base-search-service.js";
import { Collection, CollectionProps, CollectionType } from "./collection.js";
import { SearchPrincipal } from "./search-service.js";
import type { ServerfulSearchService } from "./serverful-search-service.js";

export interface ServerlessSearchServiceProps<Service>
  extends BaseSearchServiceProps<Service>,
    CollectionProps {}

/**
 * Provisions a {@link SearchService} using the "serverless" {@link Collection}.
 *
 * This configuration comes with a minimum cost of $700/mo but alleviates the
 * burden of scaling and other operations from the developer. It is appropriate
 * for high scale production applications.
 *
 * This configuration is inappropriate for developer environments. For that,
 * we recommend using the {@link ServerfulSearchService}.
 */
export class ServerlessSearchService<
  Service
> extends BaseSearchService<Service> {
  public readonly endpoint;
  public readonly collection;

  constructor(props: ServerlessSearchServiceProps<Service>) {
    super(props);

    this.collection = new Collection(this, "Collection", {
      collectionName: sanitizeCollectionName(`${props.serviceName}-search`),
      type: CollectionType.SEARCH,
      // by default destroy - users should disable this for prod
      removalPolicy: props.removalPolicy ?? RemovalPolicy.DESTROY,
    });
    this.endpoint = this.collection.collectionEndpoint;
    this.collection.grantControl(this.customResourceHandler.role!);
  }

  @grant()
  public grantControl(principal: SearchPrincipal): void {
    this.collection.grantControl(principal);
  }

  @grant()
  public grantReadWrite(principal: IRole): void {
    this.collection.grantReadWrite(principal);
  }

  @grant()
  public grantRead(principal: IRole): void {
    this.collection.grantRead(principal);
  }

  @grant()
  public grantWrite(principal: IRole): void {
    this.collection.grantWrite(principal);
  }
}
