import { Resource, aws_opensearchserverless, Lazy } from "aws-cdk-lib";
import { Construct } from "constructs";
import type { Collection } from "./collection";

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

export class AccessPolicy extends Resource {
  readonly rules;
  readonly resource;

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

            return JSON.stringify(
              Object.entries(scopes).flatMap(([access, scope]) =>
                Object.entries(scope).map(([indexPrefix, principals]) => {
                  return createIndexPolicy(
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
              ) satisfies DataAccessPolicy[]
            );

            function createIndexPolicy(
              indexPrefix: string,
              principals: string[],
              permissions: IndexPermission[]
            ): DataAccessPolicy {
              return {
                Rules: [
                  {
                    ResourceType: "index",
                    Resource: [
                      `index/${props.collection.collectionName}/${indexPrefix}`,
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

interface DataAccessPolicy {
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
