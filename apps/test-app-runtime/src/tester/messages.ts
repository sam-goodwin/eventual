export interface ReportProgressMessage {
  action: "progressUpdate";
  progress: ProgressState;
}

export function isReportProgressMessage(
  message: any
): message is ReportProgressMessage {
  return "action" in message && message.action === "progressUpdate";
}

export interface ProgressState {
  value: number;
  goal: number;
  id: string;
  done: boolean;
}

export interface InitMessage {
  action: "init";
  progresses: ProgressState[];
}

export function isInitMessage(message: any): message is InitMessage {
  return "action" in message && message.action === "init";
}
