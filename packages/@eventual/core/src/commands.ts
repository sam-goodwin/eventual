export type Command = StartLocalActivityCommand;

export interface StartLocalActivityCommand {
  type: "StartLocalActivityCommand";
  counter: number;
}