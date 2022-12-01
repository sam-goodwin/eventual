# Announcing Eventual (Part 1) - a unified, code-first experience for building adaptable and maintainable event-driven systems

Today, we're excited to announce Eventual - an open source, code-first framework and purely "serverless" service for building scalable and fault tolerant systems in the cloud. Eventual introduces 4 simple building blocks that encapsulate the mental model of event-driven systems and encode best practices for operations, observability and test-driven development. Designed for the modern cloud, Eventual can be dropped in to a new or existing cloud application using your favorite Infrastructure-as-Code (IaC) platform, and runs entirely within your own governance and security boundaries.

Our team has spent the past decade working at Amazon building large scale services with AWS. Over that time, we saw development practices evolve from manually configured machines to fully managed serverless architectures built with powerful Infrastructure-as-Code libraries using the AWS CDK. The change has been staggering and the trajectory shows no sign of slowing down - we're clearly entering a new era where application development and infrastructure management are becoming one and the same.

Approximately 5 years ago, we started on our journey to improve on the cloud developer experience that we felt was still too low-level and cumbersome. We attempted to bring application developers and platform operators closer together with Punchcard in 2018/2019 and (more recently) Functionless in 2022. Both projects embodied the same idea that the priority of developers is business logic and not infrastructure plumbing, but our bottoms-up approach of focusing on infrastructure concepts never felt complete.

While on our journey, we have noticed a recurring problem where developers struggle to translate business problems into cloud solutions. Infrastructure programming has advanced considerably in the past 5 years thanks to tooling such as the AWS CDK, SST, Pulumi and Terraform, but there still remains a large gap between concepts in a business domain and mapping them to infrastructure primitives. This layer between the business logic and infrastructure is often referred to by our friends over in the Domain-Driven-Design (DDD) space as the "Domain Layer" and is where Eventual aims to bring value. Eventual inverts the model of Punchcard and Functionless, choosing to focus on abstracting business processes instead of infrastructure primitives.

(Diagram)

Our belief is that application developers should not need to understand the nitty-gritty of cloud infrastructure and should instead focus purely on their business domain. This is not to say that the infrastructure layer should be entirely hidden or deprecated, as we also believe that both must exist in harmony for scalable and sustainable software development - a layered approach is necessary to enables incremental adoption, integration into existing systems and doesn't block the use of other valuable tools and services.

Building with Eventual is all about encapsulating business functions into small services that are connected together into larger networks that make up a business domain. These services are inspired by the concept of a "Bounded Context", which is a self-contained unit that: 1) exposes an API for synchronous interaction, 2) publishes and subscribes to asynchronous events that flow in, out and inside of the system, 3) orchestrates business logic using event handlers and long-running, durable workflows, and 4) integrates with the outside world using connectors, such as cloud resources or other SaaS offerings.

We believe these general concepts are enough to build event-driven systems of arbitrary complexity and scale.

(TODO: Diagram, AWS DynamoDB, SQS and S3, or other SaaS offerings such as Slack, Stripe, Snowflake, etc.)

Everyone wants to build faster, of course, and Eventual's powerful primitives certainly enables that by abstracting over low-level infrastructure primitives. Getting a service up and running quickly and easily is a desirable property of any development framework, but we believe it's more important to be consistently productive over the long term. As a service matures and technical debt accumulates, feature velocity inevitably slows as developer resources skew towards fixing bugs and working around legacy decisions. Our DNA comes from Amazon, so our philosophy is geared more towards scaling this long-haul journey of building and maintaining a service within the dynamic, ever-changing environment of a business. Eventual's primitives have built-in observability that accelerate the process of debugging production problems and generating tests to protect against regressions.

(idea: asymptote diagram of productivity)

To dive deeper check out the following resources:

1. [Blog: In-depth overview of Eventual's concepts]()
2. [Getting Started]()
3. [Tutorials]()
4. Twitter
5. Discord
6. Star us on Github
