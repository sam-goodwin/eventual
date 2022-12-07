export interface MetricsLogger {
  /**
   * Set a property on the published metrics.
   * This is stored in the emitted log data and you are not
   * charged for this data by CloudWatch Metrics.
   * These values can be values that are useful for searching on,
   * but have too high cardinality to emit as dimensions to
   * CloudWatch Metrics.
   *
   * @param key Property name
   * @param value Property value
   */
  setProperty(key: string, value: unknown): MetricsLogger;
  /**
   * Adds a dimension.
   * This is generally a low cardinality key-value pair that is part of the metric identity.
   * CloudWatch treats each unique combination of dimensions as a separate metric, even if the metrics have the same metric name.
   *
   * @param dimension
   * @param value
   * @see [CloudWatch Dimensions](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_concepts.html#Dimension)
   */
  putDimensions(dimensions: Record<string, string>): MetricsLogger;
  /**
   * Overwrite all dimensions on this MetricsLogger instance.
   * @see [CloudWatch Dimensions](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_concepts.html#Dimension)
   *
   * @param {Array<Record<string, string>> | Record<string, string>} dimensionSetOrSets Dimension sets to overwrite with
   * @param {boolean} [useDefault=false] whether to use default dimensions
   */
  setDimensions(
    dimensionSet: Record<string, string>,
    useDefault: boolean
  ): MetricsLogger;
  setDimensions(dimensionSet: Record<string, string>): MetricsLogger;
  setDimensions(
    dimensionSets: Array<Record<string, string>>,
    useDefault: boolean
  ): MetricsLogger;
  setDimensions(dimensionSets: Array<Record<string, string>>): MetricsLogger;
  /**
   * Clear all custom dimensions on this MetricsLogger instance
   *
   * @param useDefault indicates whether default dimensions should be used
   */
  resetDimensions(useDefault: boolean): MetricsLogger;
  /**
   * Put a metric value.
   * This value will be emitted to CloudWatch Metrics asynchronously and does not contribute to your
   * account TPS limits. The value will also be available in your CloudWatch Logs
   * @param key
   * @param value
   * @param unit
   */
  putMetric(key: string, value: number, unit?: string): MetricsLogger;
  /**
   * Set the CloudWatch namespace that metrics should be published to.
   * @param value
   */
  setNamespace(value: string): MetricsLogger;
  /**
   * Set the timestamp of metrics emitted in this context.
   *
   * If not set, the timestamp will default to new Date() at the point
   * the context is constructed.
   *
   * If set, timestamp will preserved across calls to flush().
   *
   * @param timestamp
   */
  setTimestamp(timestamp: Date | number): MetricsLogger;

  flush(): Promise<void>;
}
