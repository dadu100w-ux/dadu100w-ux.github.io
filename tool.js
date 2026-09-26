import Anthropic from "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm";

const MODEL = "claude-opus-5";

const AD = ["정상지급", "미지급", "지급오류", "확인불가", "해당없음"];
const SYNC = ["정상동기화", "미동기화", "동기화오류", "확인불가", "해당없음"];

// 노션 게임 리뷰 로그 DB의 선택지와 같은 값만 나오도록 고정
const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["합격", "재검수 필요", "불합격"] },
    verdict_reason: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["치명", "주요", "경미"] },
          category: {
            type: "string",
            enum: ["저장·서버", "광고·결제", "진행불가", "크래시", "UI", "텍스트", "기타"],
          },
          title: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["severity", "category", "title", "evidence"],
        additionalProperties: false,
      },
    },
    log_fields: {
      type: "object",
      properties: {
        play: { type: "string", enum: ["정상", "진행불가", "부분이슈", "확인불가"] },
        crash: { type: "string", enum: ["없음", "있음", "확인불가"] },
        ui: { type: "string", enum: ["없음", "있음(경미)", "있음(심각)", "확인불가"] },
        text: { type: "string", enum: ["없음", "있음", "확인불가"] },
        ad_instant: { type: "string", enum: AD },
        ad_30: { type: "string", enum: AD },
        ad_60: { type: "string", enum: AD },
        save: { type: "string", enum: SYNC },
      },
      required: ["play", "crash", "ui", "text", "ad_instant", "ad_30", "ad_60", "save"],
      additionalProperties: false,
    },
    developer_message: { type: "string" },
    missing_checks: { type: "array", items: { type: "string" } },
  },
  required: ["verdict", "verdict_reason", "issues", "log_fields", "developer_message", "missing_checks"],
  additionalProperties: false,
};

const SYSTEM = `당신은 모바일·웹 게임 검수 담당자의 메모를 정리하는 도우미입니다.
검수자가 플레이하며 적은 날것의 메모를 받아, 판정과 리뷰 로그를 정리합니다.

치명도 기준 (검수자가 실제로 보는 순서):
- 치명: 데이터 저장·서버 문제(재실행 시 진행 초기화 등), 광고 보상·결제 오류, 진행 불가(멈춤, 다음 단계로 못 감), 크래시·강제종료
- 주요: 플레이는 되지만 핵심 기능 일부가 이상함, UI가 심하게 깨져 조작이 어려움
- 경미: 오타, 약간 겹치거나 잘린 UI 등 경험을 크게 해치지 않는 것

판정:
- 치명 이슈가 하나라도 있으면 "불합격"
- 치명은 없고 주요 이슈가 있으면 "재검수 필요"
- 경미 이슈만 있거나 이슈가 없으면 "합격"

규칙:
- 메모에 적힌 것만 근거로 씁니다. 메모에 언급이 없는 항목은 추측하지 말고 "확인불가"로 둡니다.
- 의도된 동작이 분명하면(예: 즉시 닫으면 보상 없다고 안내됨) 문제로 보지 않고 "해당없음"으로 둡니다.
- evidence에는 메모의 해당 부분을 최대한 원문 그대로 옮깁니다.
- issues는 치명 → 주요 → 경미 순으로 정렬합니다.
- developer_message는 게임 제작자에게 보낼 한국어 문장입니다. 불합격·재검수면 고쳐야 할 것을 치명한 순서로, 재현 방법과 함께 짧게 씁니다. 합격이면 통과 사실과 개선 권장 사항만 씁니다. 존댓말, 비난 없이.
- missing_checks에는 이번 메모로 확인되지 않아 다음 검수 때 봐야 할 항목을 적습니다.`;

const SAMPLES = [
  {
    game: "스카이 점프 (가상)",
    target: "원스토어 출시 전 QA",
    memo: `시작화면 정상. 튜토 스킵 가능 굿
1스테이지 클리어함 조작감 괜찮음
3스테이지 보스 나오자마자 화면 멈춤.. 뒤로가기 눌러야 나가짐 두번 해봐도 똑같음
죽고 광고보고 부활 눌렀는데 30초쯤 보다 닫았더니 부활 안됨
설정 버튼 글씨 잘림 (Settin 까지만 보임)
상점 구매하기 -> 구매하가 오타
앱 껐다 켜니까 코인 0으로 돌아가있음 ㅠ`,
    result: {
      verdict: "불합격",
      verdict_reason: "재실행 시 코인 초기화, 광고 시청 후 부활 미지급, 3스테이지 진행 불가 등 치명 이슈 3건",
      issues: [
        { severity: "치명", category: "저장·서버", title: "앱 재실행 시 코인이 0으로 초기화됨", evidence: "앱 껐다 켜니까 코인 0으로 돌아가있음" },
        { severity: "치명", category: "광고·결제", title: "광고 30초 시청 후 닫으면 부활 보상 미지급", evidence: "죽고 광고보고 부활 눌렀는데 30초쯤 보다 닫았더니 부활 안됨" },
        { severity: "치명", category: "진행불가", title: "3스테이지 보스 등장 시 화면 멈춤 (2회 재현)", evidence: "3스테이지 보스 나오자마자 화면 멈춤.. 뒤로가기 눌러야 나가짐 두번 해봐도 똑같음" },
        { severity: "경미", category: "UI", title: "설정 버튼 텍스트 잘림", evidence: "설정 버튼 글씨 잘림 (Settin 까지만 보임)" },
        { severity: "경미", category: "텍스트", title: "상점 버튼 오타: 구매하가", evidence: "상점 구매하기 -> 구매하가 오타" },
      ],
      log_fields: {
        play: "진행불가", crash: "확인불가", ui: "있음(경미)", text: "있음",
        ad_instant: "확인불가", ad_30: "미지급", ad_60: "확인불가", save: "미동기화",
      },
      developer_message: `안녕하세요, 스카이 점프 출시 전 QA 결과 이번에는 반려되었습니다. 아래 순서대로 수정 부탁드립니다.

1. 데이터 저장: 앱을 종료했다가 다시 실행하면 보유 코인이 0으로 초기화됩니다.
2. 광고 보상: 사망 후 광고 부활을 선택하고 광고를 약 30초 시청한 뒤 닫으면 부활이 되지 않습니다.
3. 진행 불가: 3스테이지 보스가 등장하는 순간 화면이 멈추고, 뒤로가기로만 빠져나올 수 있습니다. 2회 재현했습니다.

함께 고쳐 주시면 좋은 부분: 설정 버튼 텍스트 잘림("Settin"), 상점 버튼 오타("구매하가" → "구매하기").`,
      missing_checks: [
        "광고를 즉시 닫았을 때와 끝까지(60초) 봤을 때 보상 지급 여부",
        "3스테이지 멈춤이 강제종료로 이어지는지",
        "4스테이지 이후 진행 (3스테이지에서 막혀 확인 못 함)",
      ],
    },
  },
  {
    game: "낚시왕 키우기 (가상)",
    target: "플랫폼 게임 검수 (반려 판정)",
    memo: `튜토리얼 자연스러움
낚시 10번 정도 해봄 문제 x
광고 바로 닫으니까 보상 없다고 안내 뜸 -> 의도된 거
60초 광고 끝까지 보고 미끼 보상 받음
인벤토리 아이콘 하나 옆칸이랑 살짝 겹침
재접속해도 물고기 도감 그대로 남아있음`,
    result: {
      verdict: "합격",
      verdict_reason: "치명·주요 이슈 없음. 인벤토리 아이콘 겹침 경미 1건",
      issues: [
        { severity: "경미", category: "UI", title: "인벤토리 아이콘이 옆 칸과 살짝 겹침", evidence: "인벤토리 아이콘 하나 옆칸이랑 살짝 겹침" },
      ],
      log_fields: {
        play: "정상", crash: "확인불가", ui: "있음(경미)", text: "확인불가",
        ad_instant: "해당없음", ad_30: "확인불가", ad_60: "정상지급", save: "정상동기화",
      },
      developer_message: `안녕하세요, 낚시왕 키우기 검수를 통과했습니다.

개선 권장: 인벤토리에서 아이콘 하나가 옆 칸과 살짝 겹쳐 보입니다. 다음 업데이트 때 함께 확인해 주세요.`,
      missing_checks: [
        "광고를 30초쯤 보다 닫았을 때 보상 처리",
        "10회 이상 장시간 플레이 시 크래시 여부",
        "텍스트 오탈자 전수 확인",
      ],
    },
  },
];

const LOG_LABELS = {
  play: "플레이 진행", crash: "크래시/강제종료", ui: "UI 깨짐", text: "텍스트 오류",
  ad_instant: "광고 즉시닫기 보상", ad_30: "광고 30초후닫기 보상", ad_60: "광고 60초후닫기 보상",
  save: "재실행 데이터 저장",
};
const BAD = new Set(["진행불가", "부분이슈", "있음", "있음(심각)", "미지급", "지급오류", "미동기화", "동기화오류"]);
const SEV_ORDER = { 치명: 0, 주요: 1, 경미: 2 };

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let lastResult = null;
let lastGame = "";

function render(r, game, isDemo) {
  lastResult = r;
  lastGame = game;
  const cls = r.verdict === "불합격" ? "fail" : r.verdict === "재검수 필요" ? "recheck" : "pass";
  const issues = [...r.issues].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

  const fieldRows = Object.entries(LOG_LABELS)
    .map(([k, label]) => {
      const v = r.log_fields[k];
      const c = BAD.has(v) ? "val-bad" : v === "확인불가" ? "val-unknown" : "";
      return `<tr><td>${label}</td><td class="${c}">${esc(v)}</td></tr>`;
    })
    .join("");

  $("out").innerHTML = `
    ${isDemo ? '<div class="demo-flag">미리 만들어 둔 예시 결과</div>' : ""}
    <div class="verdict"><span class="badge ${cls}">${esc(r.verdict)}</span><span>${esc(game)}</span></div>
    <p class="muted">${esc(r.verdict_reason)}</p>

    <h3>이슈 (${issues.length})</h3>
    ${issues.length ? issues.map((i) => `
      <div class="issue s-${esc(i.severity)}">
        <span class="sev">${esc(i.severity)} · ${esc(i.category)}</span>
        <div>${esc(i.title)}</div>
        <blockquote>${esc(i.evidence)}</blockquote>
      </div>`).join("") : '<p class="muted">발견된 이슈 없음</p>'}

    <h3>리뷰 로그 항목</h3>
    <table>${fieldRows}</table>

    <h3>제작자에게 보낼 메시지</h3>
    <div class="msg">${esc(r.developer_message)}</div>

    <h3>이번에 확인 못 한 것</h3>
    <ul class="clean">${r.missing_checks.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>

    <div class="btn-row">
      <button class="btn ghost" id="copyMsg">메시지 복사</button>
      <button class="btn ghost" id="copyMd">전체를 마크다운으로 복사</button>
    </div>`;

  $("copyMsg").onclick = () => copy(r.developer_message, "메시지를 복사했어요.");
  $("copyMd").onclick = () => copy(toMarkdown(r, game), "마크다운으로 복사했어요.");
}

function toMarkdown(r, game) {
  const issues = [...r.issues].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  return [
    `## ${game} — ${r.verdict}`,
    r.verdict_reason,
    "",
    "### 이슈",
    ...issues.map((i) => `- **[${i.severity}·${i.category}]** ${i.title}\n  - 메모: ${i.evidence}`),
    "",
    "### 리뷰 로그",
    "| 항목 | 값 |",
    "|---|---|",
    ...Object.entries(LOG_LABELS).map(([k, l]) => `| ${l} | ${r.log_fields[k]} |`),
    "",
    "### 제작자에게",
    r.developer_message,
    "",
    "### 다음에 볼 것",
    ...r.missing_checks.map((m) => `- ${m}`),
  ].join("\n");
}

async function copy(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(msg);
  } catch {
    setStatus("복사하지 못했어요. 직접 선택해서 복사해 주세요.", true);
  }
}

function setStatus(text, isError = false) {
  const s = $("status");
  s.textContent = text;
  s.className = "note" + (isError ? " error" : "");
}

document.querySelectorAll("[data-sample]").forEach((btn) => {
  btn.onclick = () => {
    const s = SAMPLES[Number(btn.dataset.sample)];
    $("game").value = s.game;
    $("target").value = s.target;
    $("memo").value = s.memo;
    render(s.result, s.game, true);
    setStatus("예시를 불러왔어요. API 키가 있으면 [정리하기]로 직접 돌려 볼 수 있어요.");
  };
});

$("run").onclick = async () => {
  const apiKey = $("apikey").value.trim();
  const memo = $("memo").value.trim();
  const game = $("game").value.trim() || "이름 없는 게임";
  if (!memo) return setStatus("메모를 먼저 넣어 주세요.", true);
  if (!apiKey) {
    $("apikey").closest("details").open = true;
    return setStatus("직접 돌리려면 API 키가 필요해요. 키가 없으면 위의 예시로 결과를 볼 수 있어요.", true);
  }

  const btn = $("run");
  btn.disabled = true;
  setStatus("정리하는 중이에요… 보통 10~30초 걸려요.");

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: `게임: ${game}\n검수 기준: ${$("target").value}\n\n<memo>\n${memo}\n</memo>`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return setStatus("모델이 이 요청을 처리하지 않았어요. 메모 내용을 확인해 주세요.", true);
    }
    if (response.stop_reason === "max_tokens") {
      return setStatus("결과가 너무 길어 중간에 끊겼어요. 메모를 나눠서 넣어 주세요.", true);
    }
    const text = response.content.find((b) => b.type === "text")?.text;
    render(JSON.parse(text), game, false);
    setStatus("정리했어요.");
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) setStatus("API 키가 올바르지 않아요.", true);
    else if (err instanceof Anthropic.RateLimitError) setStatus("요청이 많아요. 잠시 후 다시 시도해 주세요.", true);
    else if (err instanceof Anthropic.APIError) setStatus(`API 오류 (${err.status ?? "연결"}): ${err.message}`, true);
    else if (err instanceof SyntaxError) setStatus("결과를 읽지 못했어요. 다시 시도해 주세요.", true);
    else setStatus(`오류: ${err.message}`, true);
  } finally {
    btn.disabled = false;
  }
};
