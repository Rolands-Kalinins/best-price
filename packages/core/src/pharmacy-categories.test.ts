import assert from "node:assert/strict";
import { test } from "node:test";
import { CATEGORIES } from "./categories-data";
import { changedCategories } from "./category";
import { PHARMACY_CATEGORIES, PHARMACY_TO_GROCERY } from "./pharmacy-categories";

const cat = (category: string | null, title = "") => [...changedCategories(PHARMACY_CATEGORIES, [{ id: 1, title, category, cat: null }]).keys()][0];

test("категории аптек по смыслу: путь категории магазина", () => {
  assert.equal(cat("medikamenti/saaukstesanas"), "medicine");
  assert.equal(cat("medikamenti/medikamenti-berniem"), "medicine"); // лекарство для детей остаётся лекарством
  assert.equal(cat("vitamini-un-mineralvielas/vitamini"), "supplements");
  assert.equal(cat("vitamini-un-mineralvielas/tejas-un-partika/tejas"), "tea-food");
  assert.equal(cat("mutes-dobuma-higiena/zobu-pastas"), "hygiene");
  assert.equal(cat("viss-celojumiem/higienas-preces"), "hygiene");
  assert.equal(cat("higienas-preces/vates-kocini"), "hygiene");
  assert.equal(cat("skaistumam/sejas-adas-kopsana/serumi"), "skincare");
  assert.equal(cat("maminam-un-berniem/preces-bernam"), "baby");
  assert.equal(cat("medicinas-preces/ortopediskas-preces"), "medical");
  assert.equal(cat("analizu-kompleksi"), "medical");
  assert.equal(cat("preces-majdzivniekiem/barība"), "pets");
});

test("категории аптек: разделы Euroaptieka", () => {
  assert.equal(cat("maminas-un-berni/kosmetika-berniem"), "baby"); // детская косметика остаётся детской
  assert.equal(cat("maminas-un-berni/higienas-preces"), "baby");
  assert.equal(cat("bezrecepsu-medikamenti/sapes/galvassapes"), "medicine");
  assert.equal(cat("uztura-bagatinataji-vitamini/vitamini/kompleksie-vitamini"), "supplements");
  assert.equal(cat("adas-un-matu-kosmetika/sejas-adas-kopsana"), "skincare");
  assert.equal(cat("mutes-higiena/zobu-pastas"), "hygiene");
  assert.equal(cat("higiena/intima-higiena"), "hygiene");
  assert.equal(cat("medicinas-preces/termometri"), "medical");
});

test("категории аптек: без пути решает название, иначе other", () => {
  assert.equal(cat(null, "TENA Discreet uroloģiskie ieliktņi, 6 gab."), "hygiene");
  assert.equal(cat(null, "Kaut kas nezināms"), "other");
});

test("каждая категория аптеки привязана к продуктовой (или null), и такая продуктовая существует", () => {
  const grocery = new Set(CATEGORIES.map((c) => c.slug));
  for (const c of PHARMACY_CATEGORIES) {
    assert.ok(c.slug in PHARMACY_TO_GROCERY, `нет привязки для ${c.slug}`);
    const g = PHARMACY_TO_GROCERY[c.slug];
    assert.ok(g === null || grocery.has(g), `${c.slug} → ${g}: такой продуктовой категории нет`);
  }
});

test("категории аптек: разделы Benu (слаги из названий разделов сайта)", () => {
  assert.equal(cat("skaistums-un-adas-kopsana/matu-kopsana/sampuni"), "skincare");
  assert.equal(cat("uztura-bagatinataji/vitamini-un-mineralvielas/kompleksie-vitamini"), "supplements");
  assert.equal(cat("higiena/mutes-higiena/zobu-birstes"), "hygiene");
  assert.equal(cat("maminam-un-berniem/berna-higiena"), "baby");
  assert.equal(cat("bezrecepsu-medikamenti/alergija"), "medicine");
  assert.equal(cat("partika-un-tejas/tejas"), "tea-food");
  assert.equal(cat("pirma-palidziba/plaksteri"), "medical");
  assert.equal(cat(null, "Insulīna pildspalvveida šļirces adatas N100"), "medical");
});

test("категории аптек: рецептурные и ветеринарные по названию (Apotheka, где у рецептурных нет пути категории)", () => {
  assert.equal(cat(null, "OMEPRAZOLE STADA CPS 20MG N30"), "medicine");
  assert.equal(cat(null, "NUROFEN tbl. 200mg N24"), "medicine");
  assert.equal(cat(null, "HILLS Prescription Diet sausā barība suņiem 4kg"), "pets");
  assert.equal(cat(null, "Barība kaķu sterilizētiem 2kg"), "pets");
});
