# Getting Started

Eventual is a collection of NPM packages that provide primitives for building micro-services and a CDK Construct that provisions corresponding AWS Resources as a part of your [AWS CDK](https://aws.amazon.com/cdk/) or [SST](https://sst.dev/) application.

## 0. Pre-requisites

- [Node JS 16+](https://nodejs.org/en/)
- An [AWS Account](https://aws.amazon.com/)

## 1. Create a new project

```
npm create eventual my-eventual-app
```

## 2. Choose your preferred IaC platform

You will be prompted to choose between the `aws-cdk` or `aws-sst`

```
? target: (Use arrow keys)
❯ aws-cdk
  aws-sst
```

For the next steps, proceed to the corresponding documentation for your choice:

1. [AWS Cloud Development Kit (CDK)](./2-aws-cdk.md) - an AWS developer experience
2. [AWS SST](./1-aws-sst.md) - an AWS developer experience optimized for serverless

## 3. Deploy

For CDK users:

```
npx cdk deploy
```

For SST users:

```
npx sst deploy
```
