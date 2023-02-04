import type { z } from "zod";

export type Param = string | number | boolean;

export type Params<Names extends string = string> = {
  [parameterName in string]: Param | Param[];
};

export declare namespace Params {
  export type Schema<ParameterNames extends string = string> = {
    [parameterName in ParameterNames]: z.ZodType<Param | Param[] | undefined>;
  };

  export type Envelope<Params extends Schema | undefined = Schema> =
    Schema extends Params
      ? {
          params?: Params;
        }
      : Params extends undefined
      ? {
          params?: Params;
        }
      : { [header in keyof Params]?: undefined } extends Params
      ? {
          params?: FromSchema<Params>;
        }
      : {
          params: FromSchema<Params>;
        };

  export type FromSchema<P extends Schema | undefined = Schema | undefined> =
    Schema extends P
      ? Params
      : P extends undefined
      ? Params
      : z.infer<z.ZodObject<Exclude<P, undefined>>>;

  export type Parse<
    Text extends string,
    FoundNames extends string = never
  > = Text extends `:${infer NameHead extends Alphanumeric}${infer Rest}`
    ? TakeWhile<Rest, Alphanumeric> extends [
        infer Tail extends string,
        infer NameTail extends string
      ]
      ? Parse<Tail, FoundNames | `${NameHead}${NameTail}`>
      : FoundNames
    : Text extends `${Alphanumeric | "/"}${infer Rest}`
    ? Parse<Rest, FoundNames>
    : FoundNames;
}

export type TakeWhile<
  Input extends string,
  Match extends string,
  Result extends string = ""
> = Input extends `${infer C}${infer Rest}`
  ? C extends Match
    ? TakeWhile<Rest, Match, `${Result}${C}`>
    : [Input, Result]
  : [Input, Result];

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

type Alphanumeric = Digit | Letter;
type Letter = UppercaseLetter | LowercaseLetter;
type UppercaseLetter = Uppercase<LowercaseLetter>;
type LowercaseLetter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";
