import type { ComponentProps } from "react";
import { RouterProvider } from "react-router";

export function App({ router }: { router: ComponentProps<typeof RouterProvider>["router"] }) {
  return <RouterProvider router={router} />;
}
