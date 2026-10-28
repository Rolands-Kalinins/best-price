// Вызов Gemini через REST (SDK не нужен). Ключ только в заголовке и только из окружения; в сообщениях об ошибках его нет.
type Opts = { apiKey: string; model: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> };

const ATTEMPTS = 3;

/** Текст JSON-ответа по схеме. 429, 5xx и сетевые сбои повторяются с паузой 2 и 4 с; 4xx и пустой ответ — исключение. */
export async function askGemini(prompt: string, schema: object, o: Opts): Promise<string> {
  const doFetch = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${o.model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
        if (!text) throw new Error("Gemini: пустой ответ");
        return text;
      }
      last = `Gemini HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) throw new Error(last);
    } catch (e) {
      if (e instanceof Error && (e.message.startsWith("Gemini HTTP 4") || e.message.includes("пустой"))) throw e;
      last = e instanceof Error ? e.message : String(e);
    }
    if (attempt < ATTEMPTS) await sleep(2000 * attempt);
  }
  throw new Error(`Gemini: ${ATTEMPTS} попытки не удались (${last})`);
}
