---
sidebar_position: 0.1
---

# Service Limits

There are various limits that you should be aware of when it comes to scaling a Service in AWS.

## Default limit of StartExecution <= 50 TPS

Each Workflow Execution is given its own AWS CloudWatch LogStream. The [CreateLogStream](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_CreateLogStream.html) API is limited to 50 TPS per account/region by default. This limits the [`StartWorkflow`](./workflow.md#start-execution) API to 50 TPS.

This account can be raised by submitting a request to AWS for the AWS account and region. See

For more information, see:

- [AWS Service Quotas](https://docs.aws.amazon.com/servicequotas/latest/userguide/intro.html)
- [AWS CloudWatch Logs Service Limits](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch_limits_cwl.html)

## Activity Response must be <= 256KB

Size of the response from an Activity has a hard limit of <= 256KB because of its dependency on SQS SendMessage to communicate the response.
