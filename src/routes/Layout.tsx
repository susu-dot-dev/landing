import { Link, Outlet, useLocation } from "react-router";

export function Layout() {
  const { pathname } = useLocation();
  if (pathname === "/") {
    return <Outlet />;
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b px-6 py-4">
        <Link to="/" className="font-medium tracking-tight">
          susu.dev
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Outlet />
      </main>
    </div>
  );
}
