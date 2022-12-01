# Announcing Eventual (Part 1) - a unified, code-first experience for building adaptable and maintainable event-driven systems

Today, we're excited to announce Eventual - an open source, code-first framework and purely "serverless" service for building scalable and fault tolerant systems in the cloud. Eventual introduces 4 simple building blocks that encapsulate the mental model of event-driven systems and encode best practices for operations, observability and test-driven development. Designed for the modern cloud, Eventual can be dropped in to a new or existing cloud application using your favorite Infrastructure-as-Code (IaC) platform, and runs entirely within your own governance and security boundaries.

Our team has spent the past decade working at Amazon building large scale services with AWS. Over that time, we saw development practices evolve from manually configured machines to fully managed serverless architectures built with powerful Infrastructure-as-Code libraries using the AWS CDK. The change has been staggering and the trajectory shows no sign of slowing down - we're clearly entering a new era where application development and infrastructure management are becoming one and the same, but there's still a long way to go! We've only just scratched the surface of what's now possible in the cloud.

// TODO: talk about how Amazon is making a shift towards distributing reusable infrastructure components ??

Approximately 5 years ago, we set out on a journey to improve the cloud developer experience that we felt was still too low-level and cumbersome. We attempted to bring application developers and platform operators closer together with Punchcard in 2018/2019 and (more recently) Functionless in 2022. Both projects embodied the same idea that the priority of developers is business logic and not infrastructure plumbing, but our bottoms-up approach of focusing on infrastructure concepts never felt complete.

While on our journey, we have noticed a recurring problem where developers struggle to translate business problems into cloud solutions. Infrastructure programming has advanced considerably in the past 5 years thanks to tooling such as the AWS CDK, SST, Pulumi and Terraform, but there still remains a large gap between concepts in a business domain and mapping them to infrastructure primitives. This layer between the business logic and infrastructure is often referred to by our friends over in the Domain-Driven-Design (DDD) space as the "Domain Layer" and it is where Eventual aims to bring value. Eventual inverts the model of Punchcard and Functionless, choosing to focus on abstracting business processes instead of infrastructure primitives.

(Diagram)

Our belief is that application developers should not need to understand the nitty-gritty of cloud infrastructure and should instead focus purely on their business domain. This is not to say that the infrastructure layer should be entirely hidden or deprecated, as we also believe that both must exist in harmony for scalable and sustainable software development. A layered approach is necessary to enable incremental adoption, integration into existing systems and the use of other valuable tools and services outside the scope of Eventual. Our solution integrates directly into IaC tools, so you are free to use Eventual along with other great solutions developed by the cloud community.

In a nutshell, building with Eventual is all about encapsulating business functions into small services that are connected together into larger networks that make up a business domain. These services are inspired by the concept of a "Bounded Context", which is a self-contained unit that: 1) exposes an API for synchronous interaction, 2) publishes and subscribes to asynchronous events that flow in, out and inside of the system, 3) orchestrates business logic using event handlers and long-running, durable workflows, and 4) integrates with the outside world using connectors, such as to cloud resources or other SaaS offerings. We believe these general concepts are enough to build event-driven systems of arbitrary complexity and scale.

(TODO: Diagram, AWS DynamoDB, SQS and S3, or other SaaS offerings such as Slack, Stripe, Snowflake, etc.)

Everyone wants to build faster, of course, and Eventual's powerful primitives certainly enable that by abstracting over low-level infrastructure primitives. Getting a service up and running quickly and easily is a desirable property of any development framework, but we believe it's more important for teams to be consistently productive over the long term (not just the short term). As a service matures and technical debt accumulates, feature velocity inevitably slows as developer resources skew towards fixing bugs and working around legacy decisions. Our DNA comes from Amazon, so our philosophy and solution is geared more towards scaling this long-haul journey of building and maintaining a service within the dynamic, ever-changing environment of a business.

(idea: asymptote diagram of productivity)

One example of how Eventual approaches these goals is its built-in observability and regression testing features. When a production error occurs, the logs for that data flow are available for download in a form that can be "played back" through the program locally for a natural debugging experience in IDEs such as VS Code. After fixing the problem, it is trivial for an operator to then commit that problematic workflow as a test so that it never reoccurs. Such tests accumulate over time and serve as a mechanism to ensure the service's quality as it evolves. This "playback" feature can also be used within a CI/CD pipeline to detect regressions by running all past data flows through the new code to check if they will still succeed - giving developers the confidence they need to make changes quickly without breaking production.

// visualizations?

We'll go in to more detail about how all of this (and more) in [Part 2](./2022-12-14-eventual-concepts-overview.md) of this blog, so be sure to check that out! You can also get started immediately or learn more by reading the below resources. We'd love to hear from you in our Discord and GitHub, and please don't forget to give us a star ⭐️ on GitHub. Stay tuned ❤️!

1. [Blog: In-depth overview of Eventual's concepts]()
2. [Getting Started]()
3. [Tutorials]()
4. Twitter
5. Discord
6. Star us on Github
