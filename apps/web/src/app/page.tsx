// Cardholder app. Owner: Axel. See docs/plan.md §3.1–3.2, §3.6.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-3xl font-semibold">Tozzecard</h1>
      <p className="max-w-md text-zinc-500">
        Your stocks, managed by an agent. Your spending, from a card you own.
      </p>
    </main>
  );
}
