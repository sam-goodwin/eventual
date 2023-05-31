import aws_opensearchserverless from "aws-cdk-lib/aws-opensearchserverless";
import { Lazy, Resource } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { Collection } from "./collection";

export enum Access {
  /**
   * Permission to create, update or delete indexes (i.e. control the indexes)
   */
  Control = "Control",
  /**
   * Permission to read documents
   */
  Read = "Read",
  /**
   * Permission to write documents
   */
  Write = "Write",
}

export interface AccessOptions {
  indexPrefix?: string;
}

export interface AccessPolicyProps {
  accessPolicyName: string;
  collection: Collection;
  rules?: AccessRule[];
}

export interface AccessRule {
  principals: string[];
  access: Access;
  indexPrefix?: string;
}

/**
 * Convenience utility for constructing a Data Access Policy for AWS OpenSearch Serverless
 *
 * @see https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-data-access.html
 */
export class DataAccessPolicy extends Resource {
  public readonly rules;
  public readonly resource;

  constructor(scope: Construct, id: string, props: AccessPolicyProps) {
    super(scope, id, {
      physicalName: props.accessPolicyName,
    });
    this.rules = [...(props.rules ?? [])];
    this.resource = new aws_opensearchserverless.CfnAccessPolicy(
      this,
      "Resource",
      {
        name: props.accessPolicyName,
        type: "data",
        policy: Lazy.string({
          produce: () => {
            // here, we flatten all of the access rules into an optimized set of rules for each index prefix
            // this means that in the most common case, where access index/* is granted, then there is only
            // two access policies
            const scopes: {
              [access in Access]?: {
                [indexPrefix: string]: string[];
              };
            } = {};
            for (const rule of this.rules) {
              const indexPrefix = rule.indexPrefix ?? "*";
              const scope = (scopes[rule.access] ??= {});
              (scope[indexPrefix] ??= []).push(...rule.principals);
            }

            // collapse all Access.Control policies into a single one and grant all
            const collectionPolicies = scopes.Control
              ? [
                  createPolicy(
                    "collection",
                    "*",
                    Array.from(new Set(Object.values(scopes.Control).flat())),
                    [
                      CollectionPermission.CreateCollectionItems,
                      CollectionPermission.DeleteCollectionItems,
                      CollectionPermission.DescribeCollectionItems,
                      CollectionPermission.UpdateCollectionItems,
                    ]
                  ),
                ]
              : [];

            // create a read and write entry for each index prefix
            const indexPolicies = Object.entries(scopes).flatMap(
              ([access, scope]) =>
                Object.entries(scope).map(([indexPrefix, principals]) => {
                  return createPolicy(
                    "index",
                    indexPrefix,
                    // de-dupe the principals
                    Array.from(new Set(principals)),
                    access === Access.Read
                      ? [
                          IndexPermission.ReadDocument,
                          IndexPermission.DescribeIndex,
                        ]
                      : access === Access.Write
                      ? [IndexPermission.WriteDocument]
                      : [
                          IndexPermission.CreateIndex,
                          IndexPermission.DeleteIndex,
                          IndexPermission.DescribeIndex,
                          IndexPermission.UpdateIndex,
                        ]
                  );
                })
            ) satisfies DataAccessPolicyDocument[];

            return JSON.stringify([...collectionPolicies, ...indexPolicies]);

            function createPolicy<ResourceType extends "index" | "collection">(
              resourceType: ResourceType,
              prefix: string,
              principals: string[],
              permissions: (ResourceType extends "index"
                ? IndexPermission
                : CollectionPermission)[]
            ): DataAccessPolicyDocument {
              return {
                Rules: [
                  {
                    ResourceType: resourceType,
                    Resource: [
                      `${resourceType}/${props.collection.collectionName}/${prefix}`,
                    ],
                    Permission: permissions,
                  },
                ],
                Principal: principals,
              };
            }
          },
        }),
      }
    );
  }

  public grantAccess(rule: AccessRule): void {
    this.rules.push(rule);
  }
}

interface DataAccessPolicyDocument {
  Rules: DataAccessRule[];
  Principal: string[];
  Description?: string;
}

interface DataAccessRule {
  ResourceType: "collection" | "index";
  Resource: string[];
  Permission: DataAccessPermission[];
}

type DataAccessPermission = IndexPermission | CollectionPermission;

enum IndexPermission {
  All = "aoss:*",
  CreateIndex = "aoss:CreateIndex",
  DeleteIndex = "aoss:DeleteIndex",
  DescribeIndex = "aoss:DescribeIndex",
  ReadDocument = "aoss:ReadDocument",
  UpdateIndex = "aoss:UpdateIndex",
  WriteDocument = "aoss:WriteDocument",
}

enum CollectionPermission {
  CreateCollectionItems = "aoss:CreateCollectionItems",
  DeleteCollectionItems = "aoss:DeleteCollectionItems",
  DescribeCollectionItems = "aoss:DescribeCollectionItems",
  UpdateCollectionItems = "aoss:UpdateCollectionItems",
}
