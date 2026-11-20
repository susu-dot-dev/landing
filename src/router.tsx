import { createBrowserRouter, createMemoryRouter, type RouteObject } from "react-router";
import { Home } from "@/routes/Home";
import { Layout } from "@/routes/Layout";
import { NotFound } from "@/routes/NotFound";

export const routes: RouteObject[] = [
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: "*", Component: NotFound },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);

/** For tests: the same route table with no browser history. */
export const createTestRouter = (initialEntries: string[] = ["/"]) =>
  createMemoryRouter(routes, { initialEntries });
