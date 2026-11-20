import { Link } from "react-router";

export function NotFound() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">There is nothing at this address.</p>
      <Link to="/" className="underline underline-offset-4">
        Back to home
      </Link>
    </section>
  );
}
