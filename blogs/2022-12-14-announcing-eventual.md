# Announcing Eventual (Part 1) - a unified, code-first experience for building adaptable and maintainable event-driven systems

Today, we're excited to announce Eventual, an open source, code-first framework and purely "serverless" service for building scalable and fault tolerant systems in the cloud. Eventual introduces 4 simple building blocks that encapsulate the mental model of event-driven systems and encode best practices around operations, observability and test-driven development. Designed for the modern cloud, Eventual can be dropped in to an existing or new cloud application within minutes using your favorite Infrastructure-as-Code (IaC) platform, all running in your own cloud and security boundaries.

Our team has spent the past decade working at Amazon building large-scale services with AWS where we have had the pleasure of witnessing and participating in its evolution. Approximately 5 years ago, we started on a journey to improve upon the cloud developer experience that we felt was still too low-level and cumbersome. We attempted to bring application developers and platform operators closer together with Punchcard in 2018/2019 and (more recently) Functionless in 2022. Both projects embodied the same idea that the priority of developers is business logic and not infrastructure plumbing, but our bottoms-up approach of focusing on the infrastructure did not resonate with developers. We've listened and learned, and our new approach is to meet developers where they are by working backwards from application development paradigms and patterns that align with current mental models and proven development practices.

While on our journey, we have noticed a recurring problem where developers struggle to translate business problems into cloud solutions. Infrastructure programming has advanced considerably in the past 5 years thanks to tooling such as the AWS CDK, SST, Pulumi and Terraform, but there still remains a large gap between concepts in a business domain and mapping them to infrastructure primitives. This layer between the business logic and infrastructure is often referred to by our friends over in the Domain-Driven-Design (DDD) space as the "Domain Layer". Eventual aims to bridge this gap with tooling and services in the Domain Layer that can be integrated into and deployed with the Infrastructure Layer.

(Diagram)

Our belief is that application developers should not need to understand the nitty-gritty of cloud infrastructure and should instead focus purely on their business domain. This is not to say that the infrastructure layer should be entirely hidden or deprecated, as we also believe that both must exist in harmony for scalable and sustainable software development. A layered approach enables incremental adoption, integration into existing systems and doesn't block the use of other valuable tools and services.

Building with Eventual is all about encapsulating business functions into small services that are connected together into larger networks that make up a business domain. These services are inspired by the concept of a "Bounded Context", which is a self-contained unit that: 1) exposes an API for synchronous interaction, 2) publishes and subscribes to asynchronous events that flow in, out and inside of the system, 3) orchestrates business logic using event handlers and long-running, durable workflows, and 4) integrates with the outside world using connectors, including (for example) cloud resources or other SaaS offerings.

These four general concepts are enough to build any event-driven system.

(TODO: Diagram, AWS DynamoDB, SQS and S3, or other SaaS offerings such as Slack, Stripe, Snowflake, etc.)

Everyone wants to build faster, of course, and Eventual's powerful primitives certainly enables that by abstracting over low-level infrastructure primitives. Getting a service up and running is quick and easy, but as a service matures and technical debt accumulates, feature velocity inevitably slows and developers resources skew towards fixing bugs and working around legacy decisions. Our DNA comes from Amazon, so our philosophy is therefore geared more towards scaling this long-haul journey of building and maintaining a service within the dynamic, ever-changing environment of a business.

(idea: asymptote diagram of productivity)

Eventual's primitives have built-in observability that provides a consistent operational experience on day 1. All

Eventual's design gives observability and

// building quickly != getting started quickly
// adapting to change, debugging problems, writing tests, operational runbooks, dashboards, testing

// Missing an overview on History/Observability/Testing

To dive deeper check out the following resources:

1. [Blog: In-depth overview of Eventual's concepts]()
2. [Getting Started]()
3. [Tutorials]()
