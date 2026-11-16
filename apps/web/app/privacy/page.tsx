import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Политика конфиденциальности" };

// Дата меняется вместе с текстом (и записью в docs/CHANGELOG.md).
const UPDATED = "16 ноября 2026 г.";
// Контактный адрес появится позже: до тех пор страница честно говорит, что его нет.
const CONTACT_EMAIL: string | null = null;

const h2 = "text-lg font-semibold";
const list = "list-disc space-y-1 pl-5";

export default function PrivacyPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-3xl space-y-6 p-4 py-8 text-sm leading-relaxed">
      <Link href="/" className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center">
        ← На главную
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Политика конфиденциальности</h1>
        <p className="text-muted-foreground">Последнее обновление: {UPDATED}</p>
      </header>

      <section className="space-y-2" aria-labelledby="operator">
        <h2 id="operator" className={h2}>1. Кто отвечает за данные</h2>
        <p>
          Оператор данных: BestPrice, частный проект для сравнения цен и акций магазинов и аптек Латвии. Мы обрабатываем данные по правилам GDPR (Общего регламента ЕС о защите данных).
        </p>
        <p>
          Контакт для вопросов и запросов:{" "}
          {CONTACT_EMAIL ? <a className="underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : "адрес будет указан на этой странице позже."}
        </p>
      </section>

      <section className="space-y-2" aria-labelledby="data">
        <h2 id="data" className={h2}>2. Какие данные мы храним и зачем</h2>
        <p>Войти можно только через аккаунт Google. Паролей у нас нет.</p>
        <ul className={list}>
          <li>
            <b>Данные аккаунта:</b> email, имя, ссылка на аватар и идентификатор аккаунта Google, а также ваша роль на сайте (участник или администратор). Нужны, чтобы вы могли войти и чтобы мы знали, что вам разрешено.
          </li>
          <li>
            <b>Сессия и защита входа:</b> IP-адрес, данные браузера (User-Agent) и время входа. Их хранит сервис входа Supabase, чтобы работали сессии и защита от взлома. Мы эти записи сами не разбираем.
          </li>
          <li>
            <b>Технические логи хостинга:</b> адрес запрошенной страницы (вместе с текстом поиска, если он есть в адресе), IP-адрес и время. Хостинг ведёт их для работы и безопасности сайта.
          </li>
          <li>
            <b>Куки:</b> только необходимые для сессии входа. Баннер согласия не нужен, потому что других кук нет.
          </li>
        </ul>
        <p>
          Цены и акции, которые показывает сайт, берутся с общедоступных сайтов магазинов и аптек. К личным данным они не относятся.
        </p>
      </section>

      <section className="space-y-2" aria-labelledby="not">
        <h2 id="not" className={h2}>3. Чего мы не делаем</h2>
        <ul className={list}>
          <li>Нет рекламы, аналитики, пикселей и трекеров.</li>
          <li>Мы не следим за тем, что вы ищете и открываете, и не храним историю поиска и профили поведения.</li>
          <li>Мы не продаём данные и не передаём их для рекламы.</li>
          <li>Сервис Gemini, который читает буклеты магазинов, получает только картинки буклетов. Ваших данных у него нет.</li>
        </ul>
      </section>

      <section className="space-y-2" aria-labelledby="basis">
        <h2 id="basis" className={h2}>4. Основание обработки</h2>
        <p>
          Данные аккаунта обрабатываются, чтобы вы могли пользоваться сайтом (статья 6(1)(b) GDPR). Сессионные записи и логи нужны для безопасности и работы сайта (законный интерес, статья 6(1)(f) GDPR).
        </p>
      </section>

      <section className="space-y-2" aria-labelledby="third">
        <h2 id="third" className={h2}>5. Кто ещё получает данные</h2>
        <ul className={list}>
          <li><b>Google:</b> вход в аккаунт.</li>
          <li><b>Supabase:</b> база данных и сервис входа, серверы в Ирландии (ЕС).</li>
          <li><b>Vercel:</b> хостинг сайта и его технические логи.</li>
          <li><b>GitHub:</b> хранит код и запускает сборщики цен. Личных данных пользователей сборщики не используют.</li>
        </ul>
        <p>Больше никому, кроме случаев, когда закон обязывает раскрыть данные по требованию властей.</p>
      </section>

      <section className="space-y-2" aria-labelledby="keep">
        <h2 id="keep" className={h2}>6. Сколько храним</h2>
        <p>
          Данные аккаунта хранятся, пока вы пользуетесь сайтом. После просьбы об удалении мы удаляем их в течение 30 дней. Сроки хранения сессионных записей и логов задают Supabase и Vercel.
        </p>
      </section>

      <section className="space-y-2" aria-labelledby="rights">
        <h2 id="rights" className={h2}>7. Ваши права</h2>
        <p>
          Вы можете запросить доступ к своим данным, их исправление или удаление, ограничение обработки, перенос данных и возразить против обработки. Мы ответим в течение 30 календарных дней. Если вы считаете, что нарушены ваши права, вы можете подать жалобу в Государственную инспекцию данных Латвии (<a className="underline underline-offset-2" href="https://www.dvi.gov.lv" rel="noopener noreferrer">dvi.gov.lv</a>).
        </p>
      </section>

      <section className="space-y-2" aria-labelledby="kids">
        <h2 id="kids" className={h2}>8. Дети</h2>
        <p>Сайт не предназначен для детей младше 16 лет, мы сознательно не собираем их данные.</p>
      </section>

      <section className="space-y-2" aria-labelledby="changes">
        <h2 id="changes" className={h2}>9. Изменения</h2>
        <p>Если мы изменим политику, дата вверху страницы изменится. Существенные изменения будут видны на сайте.</p>
      </section>
    </main>
  );
}
