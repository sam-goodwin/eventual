// the user's entry point will register actions as a side effect.
import "@eventual/injected/actions";
import { actionWorker } from "../handlers/action-worker.js";

export default actionWorker();
