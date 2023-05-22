import { sanitizeCollectionName } from "@eventual/aws-runtime";
import {
  BaseSearchService,
  BaseSearchServiceProps,
} from "./base-search-service";
import { CollectionProps, Collection, CollectionType } from "./collection";
import { IRole } from "aws-cdk-lib/aws-iam";

export interface ServerlessSearchServiceProps
  extends BaseSearchServiceProps,
    CollectionProps {}

export class ServerlessSearchService extends BaseSearchService {
  readonly endpoint;
  readonly collection;

  constructor(props: ServerlessSearchServiceProps) {
    super(props.serviceScope, "Search");

    this.collection = new Collection(this, "Collection", {
      collectionName: sanitizeCollectionName(`${props.serviceName}-search`),
      type: CollectionType.SEARCH,
    });
    this.endpoint = this.collection.collectionEndpoint;
  }

  public grantReadWrite(principal: IRole): void {
    this.collection.grantReadWrite(principal);
  }

  public grantRead(principal: IRole): void {
    this.collection.grantRead(principal);
  }

  public grantWrite(principal: IRole): void {
    this.collection.grantWrite(principal);
  }
}
