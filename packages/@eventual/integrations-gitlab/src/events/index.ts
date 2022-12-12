import { PipelineEvent } from "./pipeline.js";
import { PushEvent } from "./push.js";

export { PushEvent } from "./push.js";
export { PipelineEvent } from "./pipeline.js";

export type GitlabEvent = PushEvent | PipelineEvent;
