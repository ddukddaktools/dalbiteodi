/* 달빛어린이병원 찾기 — 전국 지도 → 시·도 드릴다운 */
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const svg = document.getElementById("map");
  const panel = document.getElementById("panel");
  const tooltip = document.getElementById("tooltip");
  const legend = document.getElementById("legend");
  const backBtn = document.getElementById("backBtn");
  const mapPopup = document.getElementById("mapPopup");
  const mapTitle = document.getElementById("mapTitle");

  const FULL_VB = DATA.meta.viewBox;
  const hospitalsByRegion = {};
  DATA.hospitals.forEach(h => (hospitalsByRegion[h.region] ??= []).push(h));
  const countOf = name => (hospitalsByRegion[name] || []).length;
  const totalCount = DATA.hospitals.length;
  const activeRegions = Object.keys(hospitalsByRegion).length;

  /* 병원 수 구간 — 브랜드 블루 단일 색상 순차 램프, 밝은 표면 위에서 진할수록 많음 */
  const BINS = [
    { max: 0, fill: "#eef0f5", text: "#9197a8", label: "0곳" },
    { max: 3, fill: "#d9e2fc", text: "#1a3fc2", label: "1–3곳" },
    { max: 8, fill: "#a9bcf7", text: "#12308f", label: "4–8곳" },
    { max: 19, fill: "#5b7fff", text: "#ffffff", label: "9–19곳" },
    { max: Infinity, fill: "#2754eb", text: "#ffffff", label: "20곳 이상" },
  ];
  const binOf = n => BINS.find(b => n <= b.max);

  let mode = "nation";           // 'nation' | 'region'
  let currentRegion = null;
  let currentVB = FULL_VB.slice();
  let vbAnim = null;
  let selectedId = null;         // 선택된 병원 카드/점 (region+index 키)

  /* ── SVG 구성 ─────────────────────────────────────────── */
  svg.setAttribute("viewBox", FULL_VB.join(" "));
  const gProv = document.createElementNS(SVG_NS, "g");
  const gDots = document.createElementNS(SVG_NS, "g");
  const gLabels = document.createElementNS(SVG_NS, "g");
  svg.append(gProv, gDots, gLabels);

  const provEls = {};
  DATA.provinces.forEach(p => {
    const n = countOf(p.name);
    const bin = binOf(n);
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", p.d);
    path.setAttribute("fill", bin.fill);
    path.setAttribute("class", "province");
    path.setAttribute("role", "button");
    path.setAttribute("tabindex", "0");
    path.setAttribute("aria-label", `${p.name} 달빛어린이병원 ${n}곳`);
    const activate = () => { if (!(mode === "region" && currentRegion === p.name)) selectRegion(p.name); };
    path.addEventListener("click", activate);
    path.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
    });
    path.addEventListener("mousemove", e => { if (currentRegion !== p.name) showTip(e, `${p.name} · ${n}곳`); });
    path.addEventListener("mouseleave", hideTip);
    gProv.appendChild(path);
    provEls[p.name] = path;

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", p.label[0]);
    label.setAttribute("y", p.label[1]);
    label.setAttribute("class", "prov-label");
    label.setAttribute("fill", bin.text);
    const t1 = document.createElementNS(SVG_NS, "tspan");
    t1.textContent = p.short;
    const t2 = document.createElementNS(SVG_NS, "tspan");
    t2.setAttribute("x", p.label[0]);
    t2.setAttribute("dy", "17");
    t2.setAttribute("class", "cnt");
    t2.textContent = `${n}곳`;
    label.append(t1, t2);
    gLabels.appendChild(label);
  });

  legend.innerHTML = BINS.map(b =>
    `<div class="row"><span class="swatch" style="background:${b.fill}"></span>${b.label}</div>`
  ).join("");

  /* ── 툴팁 ── */
  function showTip(e, text) {
    const r = svg.parentElement.getBoundingClientRect();
    tooltip.textContent = text;
    tooltip.hidden = false;
    tooltip.style.left = (e.clientX - r.left) + "px";
    tooltip.style.top = (e.clientY - r.top) + "px";
  }
  function hideTip() { tooltip.hidden = true; }

  /* ── viewBox 트윈 ── */
  function tweenVB(target, dur = 550) {
    if (vbAnim) cancelAnimationFrame(vbAnim);
    const from = currentVB.slice();
    const t0 = performance.now();
    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    (function step(now) {
      const k = Math.min(1, (now - t0) / dur);
      const e = ease(k);
      currentVB = from.map((v, i) => v + (target[i] - v) * e);
      svg.setAttribute("viewBox", currentVB.join(" "));
      syncDotSize();
      if (k < 1) vbAnim = requestAnimationFrame(step);
    })(t0);
  }

  function bboxToVB(bbox, pad = 0.12) {
    let [x0, y0, x1, y1] = bbox;
    const w = x1 - x0, h = y1 - y0;
    const p = Math.max(w, h) * pad;
    x0 -= p; y0 -= p; x1 += p; y1 += p;
    /* 지도 프레임 비율(세로형)에 맞춰 폭·높이 보정 */
    const aspect = FULL_VB[2] / FULL_VB[3];
    let W = x1 - x0, H = y1 - y0;
    if (W / H < aspect) { const nw = H * aspect; x0 -= (nw - W) / 2; W = nw; }
    else { const nh = W / aspect; y0 -= (nh - H) / 2; H = nh; }
    return [x0, y0, W, H];
  }

  const mobileMQ = window.matchMedia("(max-width: 860px)");
  function syncDotSize() {
    /* 모바일은 터치 목표가 커지도록 점을 더 크게 */
    const r = Math.max(2, currentVB[2] / (mobileMQ.matches ? 40 : 58));
    gDots.querySelectorAll("circle").forEach(c => {
      c.setAttribute("r", c.classList.contains("sel") ? r * 1.45 : r);
      c.setAttribute("stroke-width", r * 0.42);
    });
  }

  /* ── 병원 점 ── */
  function renderDots(region) {
    gDots.innerHTML = "";
    (hospitalsByRegion[region] || []).forEach((h, i) => {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", h.x);
      c.setAttribute("cy", h.y);
      c.setAttribute("class", "hosp-dot");
      c.dataset.id = `${region}:${i}`;
      c.dataset.district = h.district;
      c.addEventListener("click", e => { e.stopPropagation(); selectHospital(`${region}:${i}`, true); });
      c.addEventListener("mousemove", e => showTip(e, `${h.name} · ${h.phone}`));
      c.addEventListener("mouseleave", hideTip);
      gDots.appendChild(c);
    });
    syncDotSize();
  }

  /* ── 화면 전환 ─────────────────────────────────────────── */
  function selectRegion(name) {
    mode = "region";
    currentRegion = name;
    selectedId = null;
    const p = DATA.provinces.find(p => p.name === name);
    Object.entries(provEls).forEach(([n, el]) => {
      el.classList.toggle("dimmed", n !== name);
      el.classList.toggle("active", n === name);
      /* 선택 지역은 점이 잘 보이도록 중립 배경, 나머지는 원래 구간 색으로 복원 */
      el.setAttribute("fill", n === name ? "#f1f3f9" : binOf(countOf(n)).fill);
    });
    gLabels.querySelectorAll(".prov-label").forEach(l => l.classList.add("hidden-label"));
    legend.classList.add("hidden");
    renderDots(name);
    tweenVB(bboxToVB(p.bbox));
    backBtn.hidden = false;
    mapTitle.textContent = name;
    renderRegionPanel(name);
    hideTip();
    hideMapPopup();
  }

  function backToNation() {
    mode = "nation";
    currentRegion = null;
    gDots.innerHTML = "";
    Object.entries(provEls).forEach(([n, el]) => {
      el.classList.remove("dimmed", "active");
      el.setAttribute("fill", binOf(countOf(n)).fill);
    });
    gLabels.querySelectorAll(".prov-label").forEach(l => l.classList.remove("hidden-label"));
    legend.classList.remove("hidden");
    tweenVB(FULL_VB);
    backBtn.hidden = true;
    mapTitle.textContent = "시·도를 선택하세요";
    renderNationPanel();
    hideMapPopup();
  }
  backBtn.addEventListener("click", backToNation);

  /* ── 패널: 전국 ── */
  const esc = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function renderNationPanel() {
    const rows = DATA.provinces
      .map(p => ({ name: p.name, short: p.short, n: countOf(p.name) }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "ko"));
    const max = rows[0].n;
    panel.innerHTML = `
      <div class="stat-tile">
        <div class="num">${totalCount}<small>곳 운영 중</small></div>
        <div class="sub">전국 ${activeRegions}개 시·도 · ${DATA.meta.collectedAt} 수집 기준 · 야간·휴일 소아 경증 외래진료</div>
      </div>
      <div class="region-list">
        ${rows.map(r => `
          <button class="region-row${r.n === 0 ? " zero" : ""}" data-region="${esc(r.name)}" ${r.n === 0 ? "" : ""}>
            <span>${r.short}</span>
            <span class="bar-track"><span class="bar" style="width:${max ? (r.n / max) * 100 : 0}%"></span></span>
            <span class="cnt">${r.n}</span>
          </button>`).join("")}
      </div>
      <p class="list-note">막대는 시·도별 병원 수입니다. 지역을 누르면 지도가 해당 시·도로 확대됩니다.</p>`;
    panel.querySelectorAll(".region-row").forEach(b =>
      b.addEventListener("click", () => selectRegion(b.dataset.region)));
  }

  /* ── 패널: 지역 상세 ── */
  let activeDistrict = "전체";

  function renderRegionPanel(region) {
    activeDistrict = "전체";
    const list = hospitalsByRegion[region] || [];

    if (list.length === 0) {
      panel.innerHTML = `
        <div class="panel-head">
          <h3>${esc(region)}</h3>
          <div class="sub">수집일(${DATA.meta.collectedAt}) 기준 등록된 달빛어린이병원이 없습니다</div>
        </div>
        <div class="empty-state">
          <div class="big">🌘</div>
          <p>이 지역은 현재 달빛어린이병원 미지정 지역입니다.<br>
          야간·휴일 진료 가능 기관은 <a href="https://www.e-gen.or.kr" target="_blank" rel="noopener">응급의료포털 E-Gen</a>
          또는 <a href="tel:119">119</a>에서 안내받을 수 있습니다.</p>
        </div>`;
      return;
    }

    const districts = [...new Set(list.map(h => h.district).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ko"));

    panel.innerHTML = `
      <div class="panel-head">
        <h3>${esc(region)} <span class="hl">${list.length}곳</span></h3>
        <div class="sub">이름순 정렬 · 방문 전 반드시 전화로 진료 여부를 확인하세요</div>
      </div>
      ${districts.length > 1 ? `<div class="chips">
        <button class="chip on" data-d="전체">전체 ${list.length}</button>
        ${districts.map(d => `<button class="chip" data-d="${esc(d)}">${esc(d)} ${list.filter(h => h.district === d).length}</button>`).join("")}
      </div>` : ""}
      <div class="cards">
        ${list.map((h, i) => `
          <article class="card" data-id="${esc(region)}:${i}" data-district="${esc(h.district)}">
            <div class="card-top">
              <span class="name">${esc(h.name)}</span>
              <span class="type-badge">${esc(h.type)}</span>
            </div>
            <div class="addr">${esc(h.address)}</div>
            <div class="card-actions">
              <a class="act-btn act-tel" href="tel:${esc(h.phone)}" onclick="event.stopPropagation()">📞 ${esc(h.phone)}</a>
              <a class="act-btn act-map" target="_blank" rel="noopener" onclick="event.stopPropagation()"
                 href="https://map.kakao.com/link/map/${encodeURIComponent(h.name)},${h.lat},${h.lng}">🗺️ 지도앱</a>
            </div>
          </article>`).join("")}
      </div>
      <p class="list-note">목록은 이름(가나다)순이며 추천·평가 순위가 아닙니다. 진료시간이 불규칙할 수 있으니 전화 확인 후 방문하세요.</p>`;

    panel.querySelectorAll(".chip").forEach(chip =>
      chip.addEventListener("click", () => {
        activeDistrict = chip.dataset.d;
        panel.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c === chip));
        applyDistrictFilter();
      }));
    panel.querySelectorAll(".card").forEach(card =>
      card.addEventListener("click", () => selectHospital(card.dataset.id, false)));
  }

  function applyDistrictFilter() {
    const all = activeDistrict === "전체";
    panel.querySelectorAll(".card").forEach(c =>
      c.style.display = (all || c.dataset.district === activeDistrict) ? "" : "none");
    gDots.querySelectorAll("circle").forEach(d =>
      d.classList.toggle("dim", !(all || d.dataset.district === activeDistrict)));
    selectHospital(null, false);
  }

  /* ── 병원 선택 (점 ↔ 카드 연동) ── */
  function selectHospital(id, fromDot) {
    selectedId = id;
    gDots.querySelectorAll("circle").forEach(d => d.classList.toggle("sel", d.dataset.id === id));
    syncDotSize();
    panel.querySelectorAll(".card").forEach(c => {
      const on = c.dataset.id === id;
      c.classList.toggle("sel", on);
      /* 데스크톱은 우측 목록의 카드를 화면 중앙으로, 모바일은 지도 안 배너로 안내 */
      if (on && fromDot && !mobileMQ.matches) c.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    if (id && fromDot && mobileMQ.matches) showMapPopup(id);
    else hideMapPopup();
  }

  /* ── 지도 안 병원 정보 배너 (모바일) ── */
  function showMapPopup(id) {
    const sep = id.indexOf(":");
    const region = id.slice(0, sep);
    const h = (hospitalsByRegion[region] || [])[+id.slice(sep + 1)];
    if (!h) return;
    mapPopup.innerHTML = `
      <button class="popup-close" aria-label="닫기">×</button>
      <div class="card-top">
        <span class="name">${esc(h.name)}</span>
        <span class="type-badge">${esc(h.type)}</span>
      </div>
      <div class="addr">${esc(h.address)}</div>
      <div class="card-actions">
        <a class="act-btn act-tel" href="tel:${esc(h.phone)}">📞 ${esc(h.phone)}</a>
        <a class="act-btn act-map" target="_blank" rel="noopener"
           href="https://map.kakao.com/link/map/${encodeURIComponent(h.name)},${h.lat},${h.lng}">🗺️ 지도앱</a>
      </div>`;
    mapPopup.hidden = false;
    mapPopup.querySelector(".popup-close").addEventListener("click", () => selectHospital(null, false));
    hideTip();
    requestAnimationFrame(anchorPopup);
  }
  function hideMapPopup() {
    mapPopup.hidden = true;
    mapPopup.innerHTML = "";
    mapPopup.classList.remove("vv-fixed");
  }

  /* 핀치줌 상태에서는 배너를 현재 보이는 화면(비주얼 뷰포트) 하단에 고정 —
     확대를 풀지 않아도 병원 정보가 바로 보이도록 */
  const vv = window.visualViewport;
  function anchorPopup() {
    if (mapPopup.hidden) return;
    if (!vv || vv.scale <= 1.02) {
      mapPopup.classList.remove("vv-fixed");
      mapPopup.style.left = mapPopup.style.top = mapPopup.style.width = "";
      return;
    }
    const pad = 8;
    mapPopup.classList.add("vv-fixed");
    mapPopup.style.width = (vv.width - pad * 2) + "px";
    mapPopup.style.left = (vv.offsetLeft + pad) + "px";
    mapPopup.style.top = (vv.offsetTop + vv.height - mapPopup.offsetHeight - pad) + "px";
  }
  if (vv) {
    vv.addEventListener("resize", anchorPopup);
    vv.addEventListener("scroll", anchorPopup);
  }

  /* ── 시작 ── */
  renderNationPanel();
})();
