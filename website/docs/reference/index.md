# Concepts

Welcome to the Eventual Concepts documentation! This guide provides an overview of the key concepts and components of Eventual, a set of tools for building and deploying microservices on AWS.

## Building Blocks

- [Service](./0-service.md) - a collection of workflows, activities, and event handlers that represent a business domain or capability.
- [API (Request/Response)](./1-api.md) - a REST API Gateway that enables clients to interact with your service's workflows and activities.
- [Events (Pub/Sub)](./2-event.md) - an Event Bus that enables your service to publish and subscribe to events.
- [Workflows](./3-workflow.md) - a set of orchestrated activities that represent a long-running process or business logic.
- [Activities](./4-activity.md) - a set of functions that represent a single unit of work.
- [Unit Testing](./5-unit-testing.md) - API reference, guidelines and best practices for writing unit tests for your Eventual service.
- [CLI](./5-unit-testing.md) - the Eventual command-line interface (CLI) provides tools for interacting with your service from the terminal.

## Helpful Resources

- [Cheatsheet](./3.1-workflow-patterns.md) - a list of helpful patterns for solving common problems using Eventual

## Tutorials

- [Bank Account Part 1](../tutorial/1-bank-account.md) - build a reliable bank account service for depositing and transferring money
