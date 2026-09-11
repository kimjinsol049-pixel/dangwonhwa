// 단권화 — AI 중계 함수 (Vercel Serverless, 의존성 없음)
//
// 방문자가 각자 API 키를 넣지 않아도 되게, 이 함수가 소유자의 키로 Gemini를 대신 부른다.
// 키는 Vercel 환경변수 GEMINI_API_KEY 에만 있고 브라우저로 내려가지 않는다.
//
// 환경변수
//   GEMINI_API_KEY  (필수)  구글 AI Studio 키
//   GEMINI_MODEL    (선택)  고정할 모델 id. 없으면 키로 쓸 수 있는 모델을 조회해 고른다
//   APP_PASSCODE    (선택)  설정하면 이 암구호를 보낸 요청만 받는다. 남용이 걱정될 때 켠다
//   ALLOW_ORIGIN    (선택)  추가로 허용할 출처. 쉼표로 여러 개. 기본은 동일 출처 + GitHub Pages

const GEM = "https://generativelanguage.googleapis.com/v1beta";

const MAX_PROMPT_CHARS = 40000;
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

const DEFAULT_ORIGINS = ["https://kimjinsol049-pixel.github.io"];

let cachedModel = null;

function score(id) {
  let s = 0;
  if (/flash/i.test(id)) s += 100;
  if (/lite/i.test(id)) s -= 30;
  if (/preview|exp\b|thinking/i.test(id)) s -= 25;
  if (/image|tts|audio|embed/i.test(id)) s -= 200;
  const m = id.match(/(\d+(?:\.\d+)?)/);
  if (m) s += parseFloat(m[1]) * 3;
  if (/latest/i.test(id)) s += 4;
  return s;
}

async function pickModel(key) {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (cachedModel) return cachedModel;
  const r = await fetch(`${GEM}/models?key=${encodeURIComponent(key)}`);
  const t = await r.text();
  if (!r.ok) {
    const err = new Error("모델 목록을 가져오지 못했다: " + t.slice(0, 200));
    err.status = r.status;
    throw err;
  }
  const list = (JSON.parse(t).models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => String(m.name || "").replace(/^models\//, ""))
    .filter((id) => id && !/image|tts|audio|embed/i.test(id))
    .sort((a, b) => score(b) - score(a));
  if (!list.length) throw new Error("이 키로 쓸 수 있는 모델이 없다");
  cachedModel = list[0];
  return cachedModel;
}

function setCors(req, res) {
  const allowed = new Set(DEFAULT_ORIGINS);
  (process.env.ALLOW_ORIGIN || "")
    .split(",").map((s) => s.trim()).filter(Boolean)
    .forEach((o) => allowed.add(o));
  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-passcode");
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const key = process.env.GEMINI_API_KEY;

  // 앱이 "이 서버가 AI를 대신 불러주나?"를 물어보는 용도
  if (req.method === "GET") {
    res.status(200).json({
      ok: true,
      keyless: !!key,
      needsPasscode: !!process.env.APP_PASSCODE,
      model: key ? (process.env.GEMINI_MODEL || cachedModel || "자동 선택") : null
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: { code: "method", message: "POST만 받는다" } });
    return;
  }
  if (!key) {
    res.status(503).json({ error: { code: "not_configured",
      message: "이 서버에 GEMINI_API_KEY가 설정돼 있지 않다. 배포한 사람이 Vercel 환경변수에 넣어야 한다." } });
    return;
  }

  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers["x-passcode"] !== pass) {
    res.status(401).json({ error: { code: "passcode", message: "암구호가 맞지 않는다." } });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    res.status(400).json({ error: { code: "bad_request", message: "prompt가 없다." } });
    return;
  }
  if (body.prompt.length > MAX_PROMPT_CHARS) {
    res.status(413).json({ error: { code: "too_large",
      message: `자료가 너무 길다. ${MAX_PROMPT_CHARS.toLocaleString()}자까지만 받는다.` } });
    return;
  }

  const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];
  for (const im of images) {
    if (!im || typeof im.data !== "string" || im.data.length > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: { code: "too_large", message: "이미지가 너무 크다." } });
      return;
    }
  }

  try {
    const model = await pickModel(key);
    const parts = images
      .map((im) => ({ inline_data: { mime_type: im.mime || "image/jpeg", data: im.data } }))
      .concat([{ text: body.prompt }]);

    const gc = { temperature: 0.4, maxOutputTokens: 8192 };
    if (body.wantJson) gc.responseMimeType = "application/json";

    const r = await fetch(
      `${GEM}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: gc })
      }
    );
    const t = await r.text();

    if (!r.ok) {
      let msg = t.slice(0, 300);
      try { msg = JSON.parse(t).error?.message || msg; } catch (e) {}
      // 키 문제는 방문자가 고칠 수 없으니 코드만 알려주고 키 내용은 절대 흘리지 않는다
      if (r.status === 400 && /API_KEY_INVALID|API key not valid/i.test(t)) {
        res.status(502).json({ error: { code: "server_key",
          message: "서버에 설정된 키가 거부됐다. 배포한 사람이 확인해야 한다." } });
        return;
      }
      if (r.status === 429) {
        res.status(429).json({ error: { code: "quota",
          message: "오늘 무료 한도를 다 썼다. 잠시 뒤에 다시 시도해줘." } });
        return;
      }
      res.status(502).json({ error: { code: "upstream", message: msg } });
      return;
    }

    const j = JSON.parse(t);
    const c = (j.candidates || [])[0];
    if (!c) {
      const blocked = j.promptFeedback && j.promptFeedback.blockReason;
      res.status(200).json({ error: { code: blocked ? "refused" : "empty",
        message: blocked || "응답이 비었다" } });
      return;
    }
    const text = ((c.content && c.content.parts) || []).map((p) => p.text || "").join("");
    res.status(200).json({
      text,
      truncated: c.finishReason === "MAX_TOKENS",
      model
    });
  } catch (e) {
    res.status(502).json({ error: { code: "upstream", message: String(e && e.message || e) } });
  }
};
