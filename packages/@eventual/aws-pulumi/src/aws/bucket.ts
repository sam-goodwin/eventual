import { s3 } from "@pulumi/aws";
import { Input, Output, ResourceOptions } from "@pulumi/pulumi";
import { IGrantable } from "./grantable";

export class Bucket extends s3.Bucket {
  readonly bucketName: Output<string>;
  readonly bucketArn: Output<string>;

  constructor(name: string, args: s3.BucketArgs, opts?: ResourceOptions) {
    super(name, args, opts);

    this.bucketName = this.bucket;
    this.bucketArn = this.arn;
  }

  private grant(
    grantee: IGrantable,
    bucketActions: string[],
    resourceArn: Input<string>,
    ...otherResourceArns: Input<string>[]
  ) {
    const resources = [resourceArn, ...otherResourceArns];

    grantee.grantPrincipal.addToPrincipalPolicy({
      Effect: "Allow",
      Action: bucketActions,
      Resource: resources,
    });

    // if (this.encryptionKey && keyActions && keyActions.length !== 0) {
    //   this.encryptionKey.grant(grantee, ...keyActions);
    // }
  }

  /**
   * Returns an ARN that represents all objects within the bucket that match
   * the key pattern specified. To represent all keys, specify ``"*"``.
   *
   * If you need to specify a keyPattern with multiple components, concatenate them into a single string, e.g.:
   *
   *   arnForObjects(`home/${team}/${user}/*`)
   *
   */
  public arnForObjects(keyPattern: string): Output<string> {
    return this.bucketArn.apply((bucketArn) => `${bucketArn}/${keyPattern}`);
  }

  public grantRead(identity: IGrantable, objectsKeyPattern: any = "*") {
    this.grant(
      identity,
      BUCKET_READ_ACTIONS,
      this.bucketArn,
      this.arnForObjects(objectsKeyPattern)
    );
  }

  public grantWrite(identity: IGrantable, objectsKeyPattern: any = "*") {
    this.grant(
      identity,
      [...BUCKET_DELETE_ACTIONS, ...BUCKET_PUT_ACTIONS],
      this.bucketArn,
      this.arnForObjects(objectsKeyPattern)
    );
  }

  public grantReadWriteData(
    identity: IGrantable,
    objectsKeyPattern: any = "*"
  ): void {
    this.grant(
      identity,
      [...BUCKET_READ_ACTIONS, ...BUCKET_DELETE_ACTIONS, ...BUCKET_PUT_ACTIONS],
      this.bucketArn,
      this.arnForObjects(objectsKeyPattern)
    );
  }
}

const BUCKET_READ_ACTIONS = ["s3:GetObject*", "s3:GetBucket*", "s3:List*"];

const BUCKET_PUT_ACTIONS = [
  "s3:PutObject",
  "s3:PutObjectLegalHold",
  "s3:PutObjectRetention",
  "s3:PutObjectTagging",
  "s3:PutObjectVersionTagging",
  "s3:Abort*",
];

const BUCKET_DELETE_ACTIONS = ["s3:DeleteObject*"];
