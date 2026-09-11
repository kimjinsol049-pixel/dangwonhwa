# Vercel 배포 — 방문자가 키 없이 쓰게 하기

이 저장소를 Vercel에 올리면 `api/ai.js`가 함께 배포된다. 이 함수가 **소유자의 키로**
AI를 대신 불러주므로, 링크를 연 사람은 아무것도 넣지 않아도 바로 쓸 수 있다.

키는 Vercel 환경변수에만 들어간다. 저장소에도, 브라우저로 내려가는 코드에도 없다.

## 1. Gemini 키 받기 (없으면)

https://aistudio.google.com → **Get API key** → 키 복사. 신용카드는 필요 없다.

## 2. Vercel에 연결

1. https://vercel.com/new 접속 (GitHub 계정으로 로그인)
2. `kimjinsol049-pixel/dangwonhwa` 저장소를 **Import**
3. 설정은 손대지 않는다 — Framework Preset은 **Other**, 빌드 명령 없음, 루트 그대로
4. **Environment Variables**에 아래를 추가:

   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | 1번에서 복사한 키 |

5. **Deploy** 클릭

1분쯤 뒤 `https://<프로젝트이름>.vercel.app` 이 생긴다. 열어보면 **AI 연결**이
"준비 끝"으로 잡혀 있고, 바로 자료를 넣을 수 있다.

앞으로 이 저장소에 push하면 Vercel이 알아서 다시 배포한다.

## 3. 확인

`https://<주소>/api/ai` 를 브라우저로 열어보면 이렇게 나와야 한다:

```json
{ "ok": true, "keyless": true, "needsPasscode": false, "model": "자동 선택" }
```

`keyless: false` 면 환경변수가 안 들어간 것이다. Vercel 프로젝트 → Settings →
Environment Variables 에서 넣고 **Redeploy** 해야 반영된다.

## 환경변수

| 이름 | 필수 | 설명 |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | 구글 AI Studio 키 |
| `GEMINI_MODEL` | | 모델을 고정하고 싶을 때. 비우면 키로 쓸 수 있는 모델을 조회해 고른다 |
| `APP_PASSCODE` | | 설정하면 이 암구호를 아는 사람만 쓸 수 있다. 남용이 걱정될 때 |
| `ALLOW_ORIGIN` | | 다른 출처에서도 부르게 허용. 쉼표로 구분 |

## 비용과 남용

무료 주소라 **주소를 아는 누구나** 이 함수를 부를 수 있고, 그만큼 소유자의
무료 한도를 쓴다. 지금 걸어둔 안전장치는 이것뿐이다:

- 요청당 자료 40,000자 · 이미지 6장 · 장당 7MB 상한
- `APP_PASSCODE`를 설정하면 암구호를 아는 사람만 사용

한도를 넘기면 함수가 429를 돌려주고, 앱은 "오늘 무료 한도를 다 썼다"고 안내한 뒤
다른 방법(직접 키 / 브라우저 모델)으로 바꿔 쓸 수 있게 한다. 요금이 청구되는 일은
무료 티어에서는 생기지 않지만, 유료 키를 넣는다면 구글 콘솔에서 **예산 알림**을
걸어두는 편이 좋다.

문제가 생기면 키를 폐기하는 게 가장 빠르다: AI Studio에서 키 삭제 → 새 키 발급 →
Vercel 환경변수 교체 → Redeploy.

## GitHub Pages는 그대로 둔다

https://kimjinsol049-pixel.github.io/dangwonhwa/ 도 계속 살아 있다. 다만 거기엔
서버 함수가 없어서 방문자가 각자 키를 넣거나 브라우저 모델을 써야 한다.

Pages에서도 Vercel 함수를 쓰고 싶으면, 브라우저 콘솔에서 한 번만:

```js
localStorage.setItem('dangwonhwa.server', 'https://<프로젝트이름>.vercel.app')
```

`api/ai.js`가 GitHub Pages 출처를 이미 허용해 두었다.
