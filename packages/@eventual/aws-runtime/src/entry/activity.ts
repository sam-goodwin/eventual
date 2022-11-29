// the user's entry point will register activities as a side effect.
import "@eventual/entry/injected";
import { activityWorker } from "../handlers/activity-worker.js";

export default activityWorker();
