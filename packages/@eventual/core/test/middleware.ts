// @ts-nocheck

import { api, HttpResponse, MiddlewareInput, MiddlewareOutput } from "../src";

interface MaybeAuthorized {
  user: {
    userId?: string;
  };
}

function auth<In>({ request, context, next }: MiddlewareInput<In>) {
  return next({
    ...context,
    user: {
      // TODO: validate
      userId: request.headers.userId!,
    },
  });
}

interface IsLoggedIn {
  loggedIn: true;
}

function isLoggedIn<In extends MaybeAuthorized>({
  context,
  next,
}: MiddlewareInput<In>) {
  if (context.user.userId === undefined) {
    return new HttpResponse("Not Logged In", {
      status: 401,
    });
  }
  return next({
    ...context,
    user: {
      userId: context.user.userId,
    },
    loggedIn: true,
  } satisfies IsLoggedIn);
}

export const loggedInCommand = api
  .use(auth)
  .use(isLoggedIn)
  .command("myLoggedInCommand", async (_request, context) => {
    context.user.userId;
    context.loggedIn;
  });

function cors(props: { allowOrigin: string; allowHeaders: string }) {
  return async function <In>({ next, context }: MiddlewareInput<In>) {
    const response = await next(context);

    response.headers["Access-Control-Allow-Origin"] = props.allowOrigin;
    response.headers["Access-Control-Allow-Headers"] = props.allowHeaders;

    return response;
  };
}

const authorized = api
  .use(
    cors({
      allowOrigin: "*",
      allowHeaders: "Authorization",
    })
  )
  .use(auth);
