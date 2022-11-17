import chalk from "chalk";

const fmt = (msg: any) => (typeof msg === "string" ? msg : JSON.stringify(msg));
/**
 * Console styles to be used throughout hte cli
 */
export const consoleStyle = {
  success: (msg: any) => chalk.bold(chalk.green(fmt(msg))),
  error: (msg: any) => chalk.bold(chalk.redBright(fmt(msg))),
  highlight: (msg: any) => chalk.bold(chalk.blue(fmt(msg))),
};

/**
 * A set of functions for printing to the console with a set style
 * @param msg Message to print
 */
export const styledConsole = {
  success: (msg: any) => console.log(consoleStyle.success(msg)),
  error: (msg: any) => console.error(consoleStyle.error(msg)),
  highlight: (msg: any) => console.log(consoleStyle.highlight(msg)),
};
