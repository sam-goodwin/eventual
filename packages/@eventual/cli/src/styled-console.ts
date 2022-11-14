import chalk from "chalk";

/**
 * Console styles to be used throughout hte cli
 */
export const consoleStyle = {
  success: (msg: string) => chalk.bold(chalk.green(msg)),
  error: (msg: string) => chalk.bold(chalk.redBright(msg)),
  highlight: (msg: string) => chalk.bold(chalk.blue(msg)),
};

/**
 * A set of functions for printing to the console with a set style
 * @param msg Message to print
 */
export const styledConsole = {
  success: (msg: string) => console.log(consoleStyle.success(msg)),
  error: (msg: string) => console.error(consoleStyle.error(msg)),
  highlight: (msg: string) => console.log(consoleStyle.highlight(msg)),
};
