# Service

The `Service` class is an AWS CDK Construct that will deploy a service built with Eventual. It provisions the following AWS Resources:

1. an AWS API Gateway V2
2. an AWS Event Bridge

```ts
api.post("/", async () => {});
```
