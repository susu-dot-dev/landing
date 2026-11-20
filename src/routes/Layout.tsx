import { Link, Outlet } from "react-router";

export function Layout() {
  return (
    <div className="min-h-screen">
      <header className="border-b px-6 py-4">
        <Link to="/" className="font-medium tracking-tight">
          susu
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Outlet />
      </main>
    </div>
  );
}
