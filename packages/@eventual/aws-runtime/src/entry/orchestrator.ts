import workflow from "@eventual/injected/workflow.js";
import { orchestrator } from "../handlers/orchestrator.js";

export default orchestrator(workflow);
