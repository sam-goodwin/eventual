// the user's entry point will register activities as a side effect.
import "@eventual/injected/activities";
import { activityWorker } from "../handlers/activity-worker.js";

export default activityWorker();
