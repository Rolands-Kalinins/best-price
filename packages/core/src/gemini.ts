// Вызов Gemini через REST (SDK не нужен). Ключ только в заголовке и только из окружения; в сообщениях об ошибках его нет.
type Opts = {
  apiKey: string;
  model: string;
  /** Сколько HTTP-запросов делать до сдачи (по умолчанию 3: повтор 429, 5xx и сбоев сети). 1 — без повторов: сбой берёт на себя запасная модель. */
  attempts?: number;
  /** Картинка к запросу (страница буклета): base64 без префикса data:. */
  image?: { mimeType: string; data: string };
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

/** status: последний HTTP-код (0 — сетевой сбой), attempts: сколько HTTP-запросов ушло (для учёта суточной квоты). */
export class GeminiError extends Error {
  status: number;
  attempts: number;
  constructor(message: string, status: number, attempts: number) {
    super(message);
    this.status = status;
    this.attempts = attempts;
  }
}

export type GeminiResult = { text: string; tokensIn: number; tokensOut: number; attempts: number };

const ATTEMPTS = 3; // по умолчанию; Opts.attempts меняет (запасная модель вместо повторов)
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);

/** Текст JSON-ответа по схеме и токены из usageMetadata (вывод = всего − вход, мысли модели входят в вывод).
 * 429, 5xx и сетевые сбои повторяются с паузой 2 и 4 с; 4xx и пустой ответ — GeminiError сразу. */
export async function askGemini(prompt: string, schema: object, o: Opts): Promise<GeminiResult> {
  const doFetch = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last = "";
  let status = 0;
  const attempts = o.attempts ?? ATTEMPTS;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res: Response | null = null;
    try {
      res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${o.model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, ...(o.image ? [{ inline_data: { mime_type: o.image.mimeType, data: o.image.data } }] : [])] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
        }),
        signal: AbortSignal.timeout(90_000), // с картинкой ответ медленнее; без тайм-аута запрос уже подвисал
      });
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      status = 0;
    }
    if (res) {
      status = res.status;
      if (res.ok) {
        // Битое тело 200 — такой же сбой попытки, как сетевой: повторяем, запрос остаётся в учёте.
        let json: { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: unknown; totalTokenCount?: unknown } } | null = null;
        try {
          json = await res.json();
        } catch (e) {
          last = `ответ не разобран: ${e instanceof Error ? e.message : String(e)}`;
        }
        if (json) {
          const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
          if (!text) throw new GeminiError("Gemini: пустой ответ", status, attempt);
          const tokensIn = num(json.usageMetadata?.promptTokenCount);
          return { text, tokensIn, tokensOut: Math.max(0, num(json.usageMetadata?.totalTokenCount) - tokensIn), attempts: attempt };
        }
      } else {
        last = `Gemini HTTP ${status}`;
        if (status !== 429 && status < 500) throw new GeminiError(last, status, attempt);
      }
    }
    if (attempt < attempts) await sleep(2000 * attempt);
  }
  throw new GeminiError(`Gemini: ${attempts} попытки не удались (${last})`, status, attempts);
}
