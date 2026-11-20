import { useState } from "react";
import { Button } from "@/components/ui/button";

export function Home() {
  const [count, setCount] = useState(0);
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Hello, world</h1>
      <p className="text-muted-foreground">
        A static React app built with Rsbuild and routed with React Router.
      </p>
      <Button onClick={() => setCount((n) => n + 1)}>Clicked {count} times</Button>
    </section>
  );
}
