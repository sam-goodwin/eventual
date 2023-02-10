export type ParsePath<
  Text extends string,
  FoundNames extends string = never
> = Text extends `:${infer NameHead extends Word}${infer Rest}`
  ? TakeWhile<Rest, Word> extends [
      infer Tail extends string,
      infer NameTail extends string
    ]
    ? ParsePath<Tail, FoundNames | `${NameHead}${NameTail}`>
    : FoundNames
  : Text extends `${Word | "/"}${infer Rest}`
  ? ParsePath<Rest, FoundNames>
  : FoundNames;

type TakeWhile<
  Input extends string,
  Match extends string,
  Result extends string = ""
> = Input extends `${infer C}${infer Rest}`
  ? C extends Match
    ? TakeWhile<Rest, Match, `${Result}${C}`>
    : [Input, Result]
  : [Input, Result];

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

type Word = Alphanumeric | "-" | "_";
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
