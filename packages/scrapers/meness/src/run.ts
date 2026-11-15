import { runScrape } from "@bestprice/core/src/scrape-run";
import { scrape } from "./index";

const SLUG = "meness";
const CHUNK = 500; // запись частями: десять тысяч строк разом упираются в таймаут и размер запроса

if (
  !(await runScrape({
    slug: SLUG,
    label: "Mēness",
    noun: "товаров",
    work: async ({ sb, sourceId }) => {
      const { products, invalid } = await scrape();
      const seen = new Date().toISOString();
      // cat (наша категория) не пишем: её ставит matcher, upsert не трогает столбцы, которых нет в строке.
      const rows = products.map((p) => ({
        source_id: sourceId,
        external_id: p.externalId,
        title: p.title,
        brand: p.brand,
        packaging: p.packaging,
        price: p.price,
        old_price: p.oldPrice,
        starts_at: p.startsAt,
        ends_at: p.endsAt,
        ean: p.ean,
        url: p.url,
        image_url: p.imageUrl,
        category: p.category,
        card_price: p.cardPrice,
        card_condition: p.cardCondition,
        card_starts_at: p.cardStartsAt,
        card_ends_at: p.cardEndsAt,
        prescription: p.prescription,
        in_stock: p.inStock,
        last_seen_at: seen,
      }));
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: upsertError } = await sb
          .schema("pharmacy")
          .from("products")
          .upsert(rows.slice(i, i + CHUNK), { onConflict: "source_id,external_id" });
        if (upsertError) throw upsertError;
      }
      return { count: products.length, invalid };
    },
  }))
)
  process.exitCode = 1;
