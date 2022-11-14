import workflow from "@eventual/injected/workflow";
import { orchestrator } from "../handlers/orchestrator.js";

export default orchestrator(workflow);
