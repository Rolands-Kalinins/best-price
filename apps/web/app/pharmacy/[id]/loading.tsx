// Скелет повторяет раскладку страницы товара: шапка, блок товара и таблица цен.
export default function Loading() {
  return (
    <>
      <div className="h-14 border-b" />
      <main id="main" className="mx-auto w-full max-w-4xl space-y-4 p-4" aria-busy="true" aria-label="Загрузка">
        <div className="bg-muted h-5 w-40 animate-pulse rounded motion-reduce:animate-none" />
        <div className="bg-card h-60 animate-pulse rounded-2xl border motion-reduce:animate-none" />
        <div className="bg-card h-64 animate-pulse rounded-2xl border motion-reduce:animate-none" />
      </main>
    </>
  );
}
