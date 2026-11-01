import { runScrape } from "@bestprice/core/src/scrape-run";
import { scrape } from "./index";

const SLUG = "lidl";

if (
  !(await runScrape({
    slug: SLUG,
    label: "Lidl",
    noun: "акций",
    work: async ({ sb, sourceId }) => {
      const { offers, invalid } = await scrape();
      const seen = new Date().toISOString();
      const { error: upsertError } = await sb
        .schema("grocery")
        .from("offers")
        .upsert(
          offers.map((o) => ({
            source_id: sourceId,
            external_id: o.externalId,
            title: o.title,
            brand: o.brand,
            packaging: o.packaging,
            price: o.price,
            old_price: o.oldPrice,
            unit_price: o.unitPrice,
            unit: o.unit,
            condition: o.condition,
            starts_at: o.startsAt,
            ends_at: o.endsAt,
            ean: o.ean,
            url: o.url,
            image_url: o.imageUrl,
            category: o.category,
            last_seen_at: seen,
          })),
          { onConflict: "source_id,external_id" },
        );
      if (upsertError) throw upsertError;
      return { count: offers.length, invalid };
    },
  }))
)
  process.exitCode = 1;
