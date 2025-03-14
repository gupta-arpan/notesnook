/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import "./polyfills";
import "@notesnook/core/dist/types";
import { getCurrentHash, getCurrentPath, makeURL } from "./navigation";
import Config from "./utils/config";

import { initalizeLogger, logger } from "./utils/logger";
import { AuthProps } from "./views/auth";

type Route<TProps = null> = {
  component: () => Promise<{
    default: TProps extends null
      ? () => JSX.Element
      : (props: TProps) => JSX.Element;
  }>;
  props: TProps | null;
};

type RouteWithPath<T = null> = {
  route: Route<T>;
  path: Routes;
};

export type Routes = keyof typeof routes;
// | "/account/recovery"
// | "/account/verified"
// | "/signup"
// | "/login"
// | "/sessionexpired"
// | "/recover"
// | "/mfa/code"
// | "/mfa/select"
// | "default";

const routes = {
  "/account/recovery": {
    component: () => import("./views/recovery"),
    props: { route: "methods" }
  },
  "/account/verified": {
    component: () => import("./views/email-confirmed"),
    props: {}
  },
  "/signup": {
    component: () => import("./views/auth"),
    props: { route: "signup" }
  },
  "/sessionexpired": {
    component: () => import("./views/auth"),
    props: { route: "sessionExpiry" }
  },
  "/login": {
    component: () => import("./views/auth"),
    props: { route: "login:email" }
  },
  "/login/password": {
    component: () => import("./views/auth"),
    props: { route: "login:email" }
  },
  "/recover": {
    component: () => import("./views/auth"),
    props: { route: "recover" }
  },
  "/login/mfa/code": {
    component: () => import("./views/auth"),
    props: { route: "login:email" }
  },
  "/login/mfa/select": {
    component: () => import("./views/auth"),
    props: { route: "login:email" }
  },
  default: { component: () => import("./app"), props: null }
} as const;

const sessionExpiryExceptions: Routes[] = [
  "/recover",
  "/account/recovery",
  "/sessionexpired",
  "/login/mfa/code",
  "/login/mfa/select",
  "/login/password"
];

function getRoute(): RouteWithPath<AuthProps> | RouteWithPath {
  const path = getCurrentPath() as Routes;
  logger.info(`Getting route for path: ${path}`);

  const signup = redirectToRegistration(path);
  const sessionExpired = isSessionExpired(path);
  const fallback = fallbackRoute();
  const route = (
    routes[path] ? { route: routes[path], path } : null
  ) as RouteWithPath<AuthProps> | null;

  return signup || sessionExpired || route || fallback;
}

function fallbackRoute(): RouteWithPath {
  return { route: routes.default, path: "default" };
}

function redirectToRegistration(path: Routes): RouteWithPath<AuthProps> | null {
  if (!IS_TESTING && !shouldSkipInitiation() && !routes[path]) {
    window.history.replaceState({}, "", makeURL("/signup", getCurrentHash()));
    return { route: routes["/signup"], path: "/signup" };
  }
  return null;
}

function isSessionExpired(path: Routes): RouteWithPath<AuthProps> | null {
  const isSessionExpired = Config.get("sessionExpired", false);
  if (isSessionExpired && !sessionExpiryExceptions.includes(path)) {
    logger.info(`User session has expired. Routing to /sessionexpired`);

    window.history.replaceState(
      {},
      "",
      makeURL("/sessionexpired", getCurrentHash())
    );
    return { route: routes["/sessionexpired"], path: "/sessionexpired" };
  }
  return null;
}

export async function init() {
  await initalizeLogger();
  const { path, route } = getRoute();
  return { ...route, path };
}

function shouldSkipInitiation() {
  return IS_THEME_BUILDER || localStorage.getItem("skipInitiation") || false;
}
