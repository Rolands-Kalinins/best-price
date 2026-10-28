// Русское слово (основа, без ё) → латышские основы без диакритики, как в столбце grocery.offers.search.
// Основа, а не слово: латышский склоняется («piens», «piena»), поиск идёт по подстроке. Ключ срабатывает на любое слово,
// которое с него начинается; из подходящих побеждает самый длинный («лимонад» раньше «лимон»).
// Основа: a-z и пробелы внутри (от 3 символов); «^» в начале = с начала слова (иначе «sula» находит «kapsulas»). Основы попадают в or() PostgREST,
// где запятая, точка и скобки ломают запрос (проверяет тест).
// Добавлять осторожно: короткая основа даёт лишние совпадения (например, «ella» нашла бы Nutella).
export const RU_LV: Record<string, string[]> = {
  // молочное, яйца
  молок: ["pien"], молочн: ["pien"], сливк: ["krejum"], сметан: ["krejum"], сыр: ["sier"], творог: ["biezpien"],
  кефир: ["kefir"], йогурт: ["jogurt"], мороженое: ["saldejum"], мороженн: ["saldejum"], яйц: ["olas"],
  масл: ["sviest", "saulespuku", "olivu"],
  // мясо, рыба
  мяс: ["gala"], курин: ["vist"], куриц: ["vist"], свинин: ["cukgal"], говядин: ["liellop"], фарш: ["malta gala", "^fars"],
  колбас: ["desa"], сосис: ["cisin"], ветчин: ["skink"], бекон: ["bekon"], рыб: ["^ziv"], лосос: ["^lasi"],
  сельд: ["silku"], селедк: ["silku"], тунец: ["tunc"], креветк: ["garnel"], печень: ["aknas"], пельмен: ["pelmen"],
  // хлеб, бакалея
  хлеб: ["maiz"], батон: ["baton"], булочк: ["bulc"], выпечк: ["cepum"], печенье: ["cepum"], печеньк: ["cepum"],
  макарон: ["makaron"], спагетти: ["spaget"], рис: ["risi", "risu"], греч: ["griki", "griku"], овсян: ["auzu"], мука: ["^milti"],
  сахар: ["cukur"], соль: ["sals"], мед: ["medus"], варенье: ["ievar"], джем: ["ievar"], хлопья: ["parsl"],
  кукуруз: ["kukuruz"], горох: ["^zirn"], фасол: ["sarkanas pupin", "baltas pupin"], орех: ["riek"], изюм: ["rozin"], чипс: ["cips", "chips"],
  пицц: ["^pica", "^pizz"], конфет: ["konfek"], шоколад: ["sokolad"],
  // напитки
  кофе: ["kafij"], чай: ["teja"], сок: ["^sula"], вода: ["mineralud", "dzeramais udens"], пиво: ["alus"], вино: ["vins"],
  шампанск: ["sampan"], водк: ["degvin"], виски: ["viski"], коньяк: ["konjak"], лимонад: ["limonad"], кола: ["coca", "^cola", "pepsi"],
  газирован: ["^gaz"],
  // овощи, фрукты
  картоф: ["kartup"], картошк: ["kartup"], морков: ["burkan"], лук: ["sipol"], чеснок: ["kiplok"], помидор: ["tomat"],
  томат: ["tomat"], огурц: ["gurk"], капуст: ["kapost"], перец: ["paprik", "pipari"], салат: ["salat"], гриб: ["senes", "senu"],
  шампиньон: ["sampinj"], свекл: ["^bies"], тыкв: ["kirb"], баклажан: ["baklazan"], кабачок: ["cukin"],
  брокколи: ["brokol"], шпинат: ["spinat"], авокадо: ["avokad"], яблок: ["^abol"], банан: ["banan"],
  апельсин: ["apelsin"], мандарин: ["mandarin"], лимон: ["citron"], груш: ["bumbier"], виноград: ["vinog"],
  клубник: ["zemen"], малин: ["aven"], черник: ["mellen"], клюкв: ["dzerven"], арбуз: ["arbuz"], дын: ["melon"],
  персик: ["persik"], слив: ["plum"], вишн: ["^kirs"], ананас: ["ananas"], киви: ["^kivi"],
  // дом, гигиена, дети, животные
  мыло: ["ziep"], шампунь: ["sampun"], паста: ["pasta"], зубн: ["zobu"], бумаг: ["papir"], подгузник: ["autin"],
  стиральн: ["velas"], порошок: ["pulver"], посуд: ["trauk"], салфетк: ["salvet"], корм: ["barib"], кошач: ["kaku"],
  собак: ["sunu"], детск: ["bern"],
};

const KEYS = Object.keys(RU_LV).sort((a, b) => b.length - a.length);

/** Латышские основы для русского слова (нижний регистр, ё = е) или null, если слова нет в словаре. */
export function latvianStems(word: string): string[] | null {
  const w = word.replace(/ё/g, "е");
  const key = KEYS.find((k) => w.startsWith(k));
  return key ? RU_LV[key] : null;
}
