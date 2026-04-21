export default function ProgramsLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <div className="h-4 w-28 animate-pulse rounded bg-zinc-200" />
      <section className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="animate-pulse rounded-md border border-zinc-200 bg-white p-4">
            <div className="h-5 w-56 rounded bg-zinc-200" />
            <div className="mt-2 h-3 w-72 rounded bg-zinc-100" />
          </div>
        ))}
      </section>
    </main>
  );
}
