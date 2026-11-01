// Скелет повторяет раскладку страницы: шапка и сетка карточек, чтобы ничего не прыгало.
export default function Loading() {
  return (
    <>
      <div className="h-14 border-b" />
      <main id="main" className="mx-auto w-full max-w-7xl space-y-4 p-4" aria-busy="true" aria-label="Загрузка">
        <h1 className="text-2xl font-semibold">Акции</h1>
        <div className="bg-muted h-5 w-64 animate-pulse rounded motion-reduce:animate-none" />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="bg-card overflow-hidden rounded-2xl border">
              <div className="bg-muted aspect-square animate-pulse motion-reduce:animate-none" />
              <div className="space-y-2 p-3">
                <div className="bg-muted h-3 w-1/3 rounded" />
                <div className="bg-muted h-4 w-full rounded" />
                <div className="bg-muted h-6 w-1/2 rounded" />
              </div>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
