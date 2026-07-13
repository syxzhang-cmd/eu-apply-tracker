(function () {
  const DATA = window.APPLICATION_TRACKER_DATA;
  const SOURCE_STATUS = window.APPLICATION_TRACKER_SOURCE_STATUS || {
    checkedAt: null,
    summary: { total: 0, ok: 0, changed: 0, failed: 0 },
    sources: {}
  };
  const STORAGE = {
    profile: "euApplyTracker.profile",
    records: "euApplyTracker.records",
    customPrograms: "euApplyTracker.customPrograms"
  };

  const state = {
    profile: readJson(STORAGE.profile, DATA.profileDefaults),
    records: readJson(STORAGE.records, {}),
    customPrograms: readJson(STORAGE.customPrograms, []),
    sourceStatus: SOURCE_STATUS,
    remoteRefreshAvailable: false,
    remoteRefreshChecked: false,
    filters: {
      query: "",
      country: "all",
      status: "all",
      tier: "all",
      possibleOnly: true
    }
  };

  const els = {
    todayLabel: document.getElementById("todayLabel"),
    metricOpen: document.getElementById("metricOpen"),
    metricUrgent: document.getElementById("metricUrgent"),
    metricFit: document.getElementById("metricFit"),
    resultCount: document.getElementById("resultCount"),
    programGrid: document.getElementById("programGrid"),
    taskList: document.getElementById("taskList"),
    timelineList: document.getElementById("timelineList"),
    calendarSummary: document.getElementById("calendarSummary"),
    calendarList: document.getElementById("calendarList"),
    materialSummary: document.getElementById("materialSummary"),
    materialList: document.getElementById("materialList"),
    sourceCheckedLabel: document.getElementById("sourceCheckedLabel"),
    sourceSummary: document.getElementById("sourceSummary"),
    sourceList: document.getElementById("sourceList"),
    refreshModeNote: document.getElementById("refreshModeNote"),
    refreshCommand: document.getElementById("refreshCommand"),
    copyRefreshCommand: document.getElementById("copyRefreshCommand"),
    runSourceRefresh: document.getElementById("runSourceRefresh"),
    refreshLog: document.getElementById("refreshLog"),
    template: document.getElementById("programTemplate"),
    profileForm: document.getElementById("profileForm"),
    searchInput: document.getElementById("searchInput"),
    countryFilter: document.getElementById("countryFilter"),
    statusFilter: document.getElementById("statusFilter"),
    tierFilter: document.getElementById("tierFilter"),
    possibleOnly: document.getElementById("possibleOnly"),
    refreshButton: document.getElementById("refreshButton"),
    exportButton: document.getElementById("exportButton"),
    importFile: document.getElementById("importFile"),
    addProgramForm: document.getElementById("addProgramForm")
  };

  const statusText = {
    open: "可投递",
    urgent: "快截止",
    future: "未开放",
    closed: "已截止",
    unknown: "待核验"
  };

  const stageText = {
    watching: "观察",
    preparing: "准备材料",
    submitted: "已递交",
    decision: "等结果",
    discarded: "放弃"
  };

  const tierText = {
    reach: "冲刺",
    match: "匹配",
    safer: "保底"
  };

  hydrateProfileForm();
  bindEvents();
  render();
  detectRefreshCapability();
  window.setInterval(render, 60000);

  function bindEvents() {
    els.profileForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(els.profileForm);
      state.profile = {
        gpa: Number(form.get("gpa")) || 0,
        ielts: Number(form.get("ielts")) || 0,
        budget: Number(form.get("budget")) || 0,
        intake: String(form.get("intake") || "2027 Fall"),
        interests: String(form.get("interests") || ""),
        countries: String(form.get("countries") || "")
      };
      writeJson(STORAGE.profile, state.profile);
      render();
    });

    els.searchInput.addEventListener("input", (event) => {
      state.filters.query = event.target.value.trim().toLowerCase();
      renderPrograms();
    });

    els.countryFilter.addEventListener("change", (event) => {
      state.filters.country = event.target.value;
      renderPrograms();
    });

    els.statusFilter.addEventListener("change", (event) => {
      state.filters.status = event.target.value;
      renderPrograms();
    });

    els.tierFilter.addEventListener("change", (event) => {
      state.filters.tier = event.target.value;
      renderPrograms();
    });

    els.possibleOnly.addEventListener("change", (event) => {
      state.filters.possibleOnly = event.target.checked;
      renderPrograms();
    });

    els.refreshButton.addEventListener("click", render);
    els.exportButton.addEventListener("click", exportState);
    els.importFile.addEventListener("change", importState);
    els.addProgramForm.addEventListener("submit", addCustomProgram);
    els.copyRefreshCommand.addEventListener("click", copyRefreshCommand);
    els.runSourceRefresh.addEventListener("click", runSourceRefresh);
  }

  function render() {
    els.todayLabel.textContent = `今日申请状态 · ${formatDate(new Date())}`;
    renderCountryOptions();
    renderMetrics();
    renderTasks();
    renderTimeline();
    renderCalendar();
    renderMaterials();
    renderUpdateMonitor();
    renderPrograms();
  }

  function renderMetrics() {
    const enriched = getEnrichedPrograms();
    const openCount = enriched.filter((item) => item.status === "open" || item.status === "urgent").length;
    const urgentCount = enriched.filter((item) => item.status === "urgent").length;
    const fitCount = enriched.filter((item) => item.fitScore >= 75 && item.status !== "closed").length;

    els.metricOpen.textContent = String(openCount);
    els.metricUrgent.textContent = String(urgentCount);
    els.metricFit.textContent = String(fitCount);
  }

  function renderCountryOptions() {
    const countries = Array.from(new Set(getPrograms().map((item) => item.country))).sort();
    const current = els.countryFilter.value || state.filters.country;
    els.countryFilter.innerHTML = `<option value="all">全部</option>${countries
      .map((country) => `<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`)
      .join("")}`;
    els.countryFilter.value = countries.includes(current) ? current : "all";
    state.filters.country = els.countryFilter.value;
  }

  function renderPrograms() {
    const items = getFilteredPrograms();
    els.resultCount.textContent = `${items.length} 个项目`;
    els.programGrid.innerHTML = "";

    if (!items.length) {
      els.programGrid.innerHTML = '<p class="empty-state">没有符合条件的项目。放宽筛选，或者先添加一个新项目。</p>';
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const card = els.template.content.firstElementChild.cloneNode(true);
      const record = getRecord(item.id);
      const sourceInfo = sourceStatusFor(item.id);

      card.dataset.status = item.status;
      card.querySelector(".school").textContent = `${item.shortName || item.school} · ${item.city}, ${item.country}`;
      card.querySelector("h3").textContent = item.program;

      const statusPill = card.querySelector(".status-pill");
      statusPill.textContent = statusText[item.status];
      statusPill.dataset.status = item.status;

      card.querySelector(".meta-row").textContent = `${item.degree} · ${item.disciplines.join(" / ")}`;
      card.querySelector(".date-row").textContent = dateSummary(item);
      card.querySelector(".fit-score").textContent = `匹配度 ${item.fitScore}`;
      card.querySelector(".tier-pill").textContent = tierText[item.tier] || item.tier;
      const verifyPill = card.querySelector(".verify-pill");
      verifyPill.textContent = verifyLabel(item, sourceInfo);
      verifyPill.dataset.source = sourceInfo.changed ? "changed" : sourceInfo.ok === false ? "failed" : "ok";
      card.querySelector(".notes").textContent = item.notes || "";
      card.querySelector(".detail-content").innerHTML = detailSections(item)
        .map((part) => `
          <section>
            <strong>${escapeHtml(part.label)}</strong>
            <p>${escapeHtml(part.value)}</p>
          </section>
        `)
        .join("");

      const tagRow = card.querySelector(".tag-row");
      tagRow.innerHTML = item.fitTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");

      card.querySelector(".requirement-row").innerHTML = requirementSummary(item)
        .map((part) => `<span data-ok="${part.ok}">${escapeHtml(part.label)}</span>`)
        .join("");

      const noteArea = card.querySelector(".card-note textarea");
      noteArea.value = record.note || "";
      noteArea.addEventListener("change", () => {
        updateRecord(item.id, { note: noteArea.value });
      });

      const stageSelect = card.querySelector(".stage-select");
      stageSelect.value = record.stage || "watching";
      stageSelect.addEventListener("change", () => {
        updateRecord(item.id, { stage: stageSelect.value });
        render();
      });

      const pinButton = card.querySelector(".pin-button");
      pinButton.textContent = record.pinned ? "★" : "☆";
      pinButton.addEventListener("click", () => {
        updateRecord(item.id, { pinned: !getRecord(item.id).pinned });
        render();
      });

      const link = card.querySelector(".source-link");
      link.href = item.source || "#";
      link.toggleAttribute("aria-disabled", !item.source);

      fragment.appendChild(card);
    });

    els.programGrid.appendChild(fragment);
  }

  function renderTasks() {
    const candidates = getEnrichedPrograms()
      .filter((item) => item.status !== "closed")
      .sort((a, b) => taskScore(b) - taskScore(a))
      .slice(0, 5);

    if (!candidates.length) {
      els.taskList.innerHTML = '<p class="empty-state">暂无今日行动。可以先补充申请池。</p>';
      return;
    }

    els.taskList.innerHTML = candidates
      .map((item) => {
        const record = getRecord(item.id);
        const sourceInfo = sourceStatusFor(item.id);
        const nextAction = nextActionFor(item, record, sourceInfo);
        return `
          <div class="task-item">
            <strong>${escapeHtml(item.shortName || item.school)}</strong>
            <span>${escapeHtml(nextAction)}</span>
            <small>${escapeHtml(dateSummary(item))}</small>
          </div>
        `;
      })
      .join("");
  }

  function renderUpdateMonitor() {
    renderRefreshMode();
    const summary = state.sourceStatus.summary || {};
    const checkedAt = state.sourceStatus.checkedAt ? formatDateTime(new Date(state.sourceStatus.checkedAt)) : null;
    els.sourceCheckedLabel.textContent = checkedAt ? `最近巡检 ${checkedAt}` : "尚未运行更新脚本";
    els.sourceSummary.innerHTML = [
      { label: "官网源", value: summary.total || 0 },
      { label: "可访问", value: summary.ok || 0 },
      { label: "疑似变动", value: summary.changed || 0 },
      { label: "访问失败", value: summary.failed || 0 }
    ]
      .map((item) => `<div><strong>${item.value}</strong><span>${item.label}</span></div>`)
      .join("");

    const rows = getPrograms()
      .map((program) => ({ program, sourceInfo: sourceStatusFor(program.id) }))
      .filter(({ program, sourceInfo }) => program.lastVerified === "待核验" || sourceInfo.changed || sourceInfo.ok === false)
      .slice(0, 8);

    if (!rows.length) {
      els.sourceList.innerHTML = '<p class="empty-state">暂无需要复核的官网源。跑完更新脚本后，变动页面会显示在这里。</p>';
      return;
    }

    els.sourceList.innerHTML = rows
      .map(({ program, sourceInfo }) => {
        const reason = sourceInfo.changed
          ? "官网疑似变动"
          : sourceInfo.ok === false
            ? `访问失败：${sourceInfo.message || "未知错误"}`
            : "截止日/费用待人工核验";
        return `
          <div class="source-item" data-alert="${sourceInfo.changed || sourceInfo.ok === false}">
            <div>
              <strong>${escapeHtml(program.shortName || program.school)}</strong>
              <span>${escapeHtml(program.program)}</span>
            </div>
            <small>${escapeHtml(reason)}</small>
            <a href="${escapeHtml(program.source || "#")}" target="_blank" rel="noreferrer">打开官网</a>
          </div>
        `;
      })
      .join("");
  }

  function renderRefreshMode() {
    const isLocalServer = location.protocol === "http:" && /^127\.0\.0\.1$|^localhost$/.test(location.hostname);
    const canRunRefresh = isLocalServer || state.remoteRefreshAvailable;
    const isHostedPage = location.protocol === "https:";
    els.runSourceRefresh.disabled = !canRunRefresh;
    els.runSourceRefresh.title = canRunRefresh ? "运行官网巡检" : "当前部署没有可用巡检接口";
    els.refreshCommand.textContent = isLocalServer || state.remoteRefreshAvailable ? "/api/refresh-sources" : "py -3 scripts\\local_server.py";
    els.refreshModeNote.textContent = isLocalServer
      ? "当前已通过本地服务打开，可以直接按按钮巡检官网链接。"
      : state.remoteRefreshAvailable
        ? "当前在线版已连接云端巡检接口，可以直接按按钮刷新官网状态。"
      : isHostedPage
        ? state.remoteRefreshChecked
          ? "当前在线分享版没有后端巡检接口；如果想让按钮可用，请部署到 Vercel 等支持 API 的平台。"
          : "正在检测当前在线版是否带有云端巡检接口。"
        : "当前是直接打开的本地文件。要启用按钮巡检，先复制命令在 PowerShell 启动本地服务，再打开 http://127.0.0.1:8765/。";
  }

  function renderTimeline() {
    const now = startOfDay(new Date());
    const max = addDays(now, 120);
    const items = getEnrichedPrograms()
      .filter((item) => item.deadlineDate && item.deadlineDate >= now && item.deadlineDate <= max)
      .sort((a, b) => a.deadlineDate - b.deadlineDate)
      .slice(0, 8);

    if (!items.length) {
      els.timelineList.innerHTML = '<p class="empty-state">未来 120 天暂无已录入截止日。</p>';
      return;
    }

    els.timelineList.innerHTML = items
      .map((item) => `
        <div class="timeline-item">
          <time>${formatDate(item.deadlineDate)}</time>
          <span>${escapeHtml(item.shortName || item.school)}</span>
          <small>${item.daysUntilDeadline} 天</small>
        </div>
      `)
      .join("");
  }

  function renderCalendar() {
    const now = startOfDay(new Date());
    const items = getEnrichedPrograms()
      .filter((item) => item.deadlineDate && item.deadlineDate >= now && getRecord(item.id).stage !== "discarded")
      .sort((a, b) => a.deadlineDate - b.deadlineDate);

    els.calendarSummary.textContent = items.length ? `${items.length} 个未来截止项` : "暂无未来截止项";

    if (!items.length) {
      els.calendarList.innerHTML = '<p class="empty-state">暂时没有未来截止日。可以先补全项目日期或放宽筛选。</p>';
      return;
    }

    const groups = new Map();
    items.forEach((item) => {
      const key = monthKey(item.deadlineDate);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });

    els.calendarList.innerHTML = Array.from(groups.entries())
      .slice(0, 8)
      .map(([month, programs]) => `
        <section class="calendar-month">
          <h3>${escapeHtml(month)}</h3>
          <div>
            ${programs
              .slice(0, 8)
              .map((item) => `
                <article class="calendar-row" data-status="${item.status}">
                  <time>${formatDate(item.deadlineDate)}</time>
                  <div>
                    <strong>${escapeHtml(item.shortName || item.school)}</strong>
                    <span>${escapeHtml(item.program)}</span>
                  </div>
                  <small>${item.daysUntilDeadline} 天</small>
                </article>
              `)
              .join("")}
          </div>
        </section>
      `)
      .join("");
  }

  function renderMaterials() {
    const items = getEnrichedPrograms()
      .filter((item) => {
        const stage = getRecord(item.id).stage || "watching";
        return item.status !== "closed" && stage !== "discarded" && stage !== "submitted" && stage !== "decision";
      })
      .sort((a, b) => taskScore(b) - taskScore(a))
      .slice(0, 6);

    els.materialSummary.textContent = items.length ? `${items.length} 个优先项目` : "暂无待办材料";

    if (!items.length) {
      els.materialList.innerHTML = '<p class="empty-state">暂无需要推进的材料。已递交或放弃的项目不会出现在这里。</p>';
      return;
    }

    els.materialList.innerHTML = items
      .map((item) => {
        const record = getRecord(item.id);
        const materials = materialChecklist(item, record);
        return `
          <article class="material-card">
            <div class="material-head">
              <div>
                <strong>${escapeHtml(item.shortName || item.school)}</strong>
                <span>${escapeHtml(item.program)}</span>
              </div>
              <small>${escapeHtml(dateSummary(item))}</small>
            </div>
            <div class="material-items">
              ${materials
                .map((material) => `
                  <label class="mini-check">
                    <input type="checkbox" data-program="${escapeHtml(item.id)}" data-material="${escapeHtml(material.key)}" ${material.done ? "checked" : ""} />
                    <span>${escapeHtml(material.label)}</span>
                  </label>
                `)
                .join("")}
            </div>
          </article>
        `;
      })
      .join("");

    els.materialList.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.dataset.program;
        const key = input.dataset.material;
        const record = getRecord(id);
        const materials = { ...(record.materials || {}), [key]: input.checked };
        updateRecord(id, { materials });
      });
    });
  }

  function getFilteredPrograms() {
    return getEnrichedPrograms()
      .filter((item) => {
        const blob = [
          item.school,
          item.shortName,
          item.program,
          item.country,
          item.city,
          item.disciplines.join(" "),
          item.fitTags.join(" ")
        ]
          .join(" ")
          .toLowerCase();
        const matchesQuery = !state.filters.query || blob.includes(state.filters.query);
        const matchesCountry = state.filters.country === "all" || item.country === state.filters.country;
        const matchesTier = state.filters.tier === "all" || item.tier === state.filters.tier;
        const matchesStatus = state.filters.status === "all" || item.status === state.filters.status;
        const possible = !state.filters.possibleOnly || item.status !== "closed";
        return matchesQuery && matchesCountry && matchesTier && matchesStatus && possible;
      })
      .sort((a, b) => {
        const pinDiff = Number(getRecord(b.id).pinned || false) - Number(getRecord(a.id).pinned || false);
        if (pinDiff) return pinDiff;
        const statusOrder = { urgent: 5, open: 4, future: 3, unknown: 2, closed: 1 };
        const statusDiff = statusOrder[b.status] - statusOrder[a.status];
        if (statusDiff) return statusDiff;
        if (a.deadlineDate && b.deadlineDate) return a.deadlineDate - b.deadlineDate;
        return b.fitScore - a.fitScore;
      });
  }

  function getEnrichedPrograms() {
    return getPrograms().map((program) => {
      const windowInfo = activeWindow(program);
      const requirementParts = requirementSummary(program);
      const status = getStatus(windowInfo);
      const fitScore = scoreProgram(program, requirementParts, status);
      return {
        ...program,
        ...windowInfo,
        status,
        fitScore
      };
    });
  }

  function getPrograms() {
    return DATA.programs.concat(state.customPrograms);
  }

  function activeWindow(program) {
    const now = startOfDay(new Date());
    const rounds = (program.rounds || [])
      .map((round) => ({
        ...round,
        opensDate: parseDate(round.opens),
        deadlineDate: parseDate(round.deadline)
      }))
      .filter((round) => round.opensDate || round.deadlineDate);

    if (!rounds.length) {
      return { activeRound: null, opensDate: null, deadlineDate: null, daysUntilDeadline: null, daysUntilOpen: null };
    }

    const futureOrActive = rounds
      .filter((round) => !round.deadlineDate || round.deadlineDate >= now)
      .sort((a, b) => (a.deadlineDate || a.opensDate || now) - (b.deadlineDate || b.opensDate || now))[0];

    const chosen = futureOrActive || rounds.sort((a, b) => (b.deadlineDate || b.opensDate || now) - (a.deadlineDate || a.opensDate || now))[0];

    return {
      activeRound: chosen,
      opensDate: chosen.opensDate,
      deadlineDate: chosen.deadlineDate,
      daysUntilDeadline: chosen.deadlineDate ? diffDays(now, chosen.deadlineDate) : null,
      daysUntilOpen: chosen.opensDate ? diffDays(now, chosen.opensDate) : null
    };
  }

  function getStatus(info) {
    const now = startOfDay(new Date());
    if (!info.deadlineDate && !info.opensDate) return "unknown";
    if (info.deadlineDate && info.deadlineDate < now) return "closed";
    if (info.opensDate && info.opensDate > now) return "future";
    if (info.deadlineDate && diffDays(now, info.deadlineDate) <= 21) return "urgent";
    return "open";
  }

  function requirementSummary(program) {
    const req = program.requirements || {};
    const profile = state.profile;
    return [
      {
        label: `GPA ${profile.gpa || 0}/${req.gpa || "?"}`,
        ok: !req.gpa || Number(profile.gpa) >= req.gpa
      },
      {
        label: `IELTS ${profile.ielts || 0}/${req.ielts || "?"}`,
        ok: !req.ielts || Number(profile.ielts) >= req.ielts
      },
      {
        label: `预算 ${money(profile.budget)}/${money(req.budget)}`,
        ok: !req.budget || Number(profile.budget) >= req.budget
      },
      {
        label: req.writingSample ? "需 writing sample" : "无需写作样本",
        ok: !req.writingSample
      }
    ];
  }

  function detailSections(item) {
    return [
      ["原表截止", item.deadlineText],
      ["语言要求", item.languageRequirement],
      ["背景要求", item.backgroundRequirement],
      ["申请材料", item.applicationMaterials],
      ["学费参考", item.tuitionNote],
      ["项目内容", item.programContent]
    ]
      .filter(([, value]) => value && String(value).trim())
      .map(([label, value]) => ({ label, value: compactText(value, 900) }));
  }

  function materialChecklist(item, record) {
    const text = [
      item.languageRequirement,
      item.backgroundRequirement,
      item.applicationMaterials,
      item.notes,
      item.programContent
    ].join(" ");
    const saved = record.materials || {};
    const base = [
      ["ps", "PS / 动机信"],
      ["cv", "CV"],
      ["transcript", "成绩单"],
      ["degree", "在读证明 / 学位证明"],
      ["language", "语言成绩"],
      ["passport", "护照 / 身份证明"]
    ];

    const conditional = [];
    if (item.requirements && item.requirements.writingSample) conditional.push(["writing", "Writing sample / 学术写作"]);
    if (hasTerm(text, ["推荐信", "reference", "recommendation"])) conditional.push(["recommendation", "推荐信"]);
    if (hasTerm(text, ["课程描述", "course description", "syllabus"])) conditional.push(["course", "课程描述"]);
    if (hasTerm(text, ["research proposal", "研究项目", "研究计划"])) conditional.push(["proposal", "Research proposal"]);
    if (hasTerm(text, ["GRE", "GMAT"])) conditional.push(["gre-gmat", "GRE / GMAT"]);
    if (hasTerm(text, ["面试", "interview"])) conditional.push(["interview", "面试准备"]);
    if (hasTerm(text, ["奖学金", "scholarship", "Eiffel", "tuition fee waiver"])) conditional.push(["scholarship", "奖学金材料"]);

    return dedupeMaterials(base.concat(conditional)).map(([key, label]) => ({
      key,
      label,
      done: Boolean(saved[key])
    }));
  }

  function hasTerm(text, terms) {
    const value = String(text || "").toLowerCase();
    return terms.some((term) => value.includes(String(term).toLowerCase()));
  }

  function dedupeMaterials(items) {
    const seen = new Set();
    return items.filter(([key]) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function scoreProgram(program, requirementParts, status) {
    let score = 45;
    const interests = splitTerms(state.profile.interests);
    const countries = splitTerms(state.profile.countries).map((item) => item.toLowerCase());
    const tags = program.fitTags.concat(program.disciplines).map((item) => item.toLowerCase());

    interests.forEach((interest) => {
      if (tags.some((tag) => tag.includes(interest.toLowerCase()) || interest.toLowerCase().includes(tag))) score += 7;
    });

    if (countries.includes(program.country.toLowerCase())) score += 8;
    score += requirementParts.filter((part) => part.ok).length * 6;
    if (status === "urgent") score += 6;
    if (status === "closed") score -= 35;
    if (program.tier === "safer") score += 4;
    if (program.tier === "reach") score -= 2;
    return Math.max(0, Math.min(99, Math.round(score)));
  }

  function taskScore(item) {
    let score = item.fitScore;
    if (item.status === "urgent") score += 40;
    if (item.status === "open") score += 20;
    if (getRecord(item.id).pinned) score += 30;
    if (item.daysUntilDeadline !== null) score += Math.max(0, 30 - item.daysUntilDeadline);
    return score;
  }

  function nextActionFor(item, record, sourceInfo) {
    if (sourceInfo.changed) return "官网页面变动，复核截止日和材料要求";
    if (sourceInfo.ok === false) return "官网访问失败，换网络或手动打开确认";
    if (item.lastVerified === "待核验") return "先核验官网开放状态和最终截止日";
    if (!record.stage || record.stage === "watching") return "判断是否进入正式清单";
    if (record.stage === "preparing") return "补齐 PS、推荐信和成绩单";
    if (record.stage === "submitted") return "记录 portal 和补件要求";
    if (record.stage === "decision") return "检查奖学金和押金节点";
    return "已放弃，必要时恢复到观察";
  }

  function sourceStatusFor(id) {
    return (state.sourceStatus.sources && state.sourceStatus.sources[id]) || {};
  }

  function verifyLabel(item, sourceInfo) {
    if (sourceInfo.changed) return "官网疑似更新";
    if (sourceInfo.ok === false) return "官网访问失败";
    if (item.lastVerified === "待核验") return "待官网核验";
    return `核验 ${item.lastVerified}`;
  }

  function copyRefreshCommand() {
    const command = els.refreshCommand.textContent.trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(command).then(
        () => {
          els.copyRefreshCommand.textContent = "已复制";
          window.setTimeout(() => {
            els.copyRefreshCommand.textContent = "复制";
          }, 1400);
        },
        () => window.prompt("复制这条命令后，在 eu-apply-tracker 目录运行：", command)
      );
      return;
    }
    window.prompt("复制这条命令后，在 eu-apply-tracker 目录运行：", command);
  }

  async function runSourceRefresh() {
    if (els.runSourceRefresh.disabled) {
      els.refreshLog.textContent = location.protocol === "https:"
        ? "这个在线地址没有后端巡检接口；请部署到 Vercel 版，或回到本地服务版操作。"
        : "请先用本地服务打开页面：http://127.0.0.1:8765/";
      return;
    }

    els.runSourceRefresh.disabled = true;
    els.runSourceRefresh.textContent = "巡检中";
    els.refreshLog.textContent = "正在访问官网链接，可能需要 1-3 分钟。";

    try {
      const response = await fetch("/api/refresh-sources", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.status) {
        throw new Error(payload.error || "巡检接口返回异常");
      }
      state.sourceStatus = payload.status;
      const summary = payload.status.summary || {};
      els.refreshLog.textContent = `巡检完成：${summary.ok || 0}/${summary.total || 0} 可访问，${summary.changed || 0} 个疑似变动，${summary.failed || 0} 个失败。`;
      render();
    } catch (error) {
      els.refreshLog.textContent = `巡检失败：${error.message}`;
    } finally {
      els.runSourceRefresh.disabled = false;
      els.runSourceRefresh.textContent = "运行巡检";
    }
  }

  async function detectRefreshCapability() {
    if (location.protocol !== "https:") {
      state.remoteRefreshChecked = true;
      return;
    }

    try {
      const controller = new AbortController();
      window.setTimeout(() => controller.abort(), 3500);
      const response = await fetch("/api/status", { signal: controller.signal });
      if (!response.ok) throw new Error("No remote status endpoint");
      const payload = await response.json();
      state.remoteRefreshAvailable = Boolean(payload.refreshAvailable);
      state.remoteRefreshChecked = true;
      if (payload.status) state.sourceStatus = payload.status;
    } catch (error) {
      state.remoteRefreshAvailable = false;
      state.remoteRefreshChecked = true;
    }
    renderUpdateMonitor();
  }

  function dateSummary(item) {
    const confidence = item.activeRound && item.activeRound.confidence === "estimate" ? "预计" : "官网";
    if (item.status === "unknown") return "日期待核验";
    if (item.status === "future") return `${confidence} ${formatDate(item.opensDate)} 开放`;
    if (item.status === "closed") return `${confidence} ${formatDate(item.deadlineDate)} 已截止`;
    return `${confidence} ${formatDate(item.deadlineDate)} 截止 · 还剩 ${item.daysUntilDeadline} 天`;
  }

  function addCustomProgram(event) {
    event.preventDefault();
    const form = new FormData(els.addProgramForm);
    const id = `custom-${Date.now()}`;
    const tags = splitTerms(String(form.get("tags") || ""));
    const custom = {
      id,
      school: String(form.get("school") || ""),
      shortName: String(form.get("school") || "").split(" ")[0],
      program: String(form.get("program") || ""),
      country: String(form.get("country") || ""),
      city: String(form.get("city") || ""),
      degree: "Master",
      tier: String(form.get("tier") || "match"),
      intake: state.profile.intake,
      disciplines: tags.length ? tags : ["社科"],
      fitTags: tags.length ? tags : ["待分类"],
      rounds: [
        {
          label: "自定义申请窗口",
          opens: String(form.get("opens") || ""),
          deadline: String(form.get("deadline") || ""),
          confidence: "manual"
        }
      ],
      requirements: { gpa: 0, ielts: 0, budget: 0, quant: "unknown", writingSample: false },
      tuitionNote: "自定义项目，请补充学费和材料要求。",
      source: String(form.get("source") || ""),
      lastVerified: "待核验",
      notes: String(form.get("notes") || "")
    };
    state.customPrograms.push(custom);
    writeJson(STORAGE.customPrograms, state.customPrograms);
    els.addProgramForm.reset();
    render();
  }

  function exportState() {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile: state.profile,
      records: state.records,
      customPrograms: state.customPrograms
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `eu-apply-tracker-${formatFileDate(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importState(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || "{}"));
        if (payload.profile) state.profile = { ...DATA.profileDefaults, ...payload.profile };
        if (payload.records) state.records = payload.records;
        if (Array.isArray(payload.customPrograms)) state.customPrograms = payload.customPrograms;
        writeJson(STORAGE.profile, state.profile);
        writeJson(STORAGE.records, state.records);
        writeJson(STORAGE.customPrograms, state.customPrograms);
        hydrateProfileForm();
        render();
      } catch (error) {
        alert("导入失败：JSON 文件无法解析。");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function hydrateProfileForm() {
    Object.entries(state.profile).forEach(([key, value]) => {
      const field = els.profileForm.elements[key];
      if (field) field.value = value;
    });
  }

  function getRecord(id) {
    return state.records[id] || {};
  }

  function updateRecord(id, patch) {
    state.records[id] = { ...getRecord(id), ...patch, updatedAt: new Date().toISOString() };
    writeJson(STORAGE.records, state.records);
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : clone(fallback);
    } catch (error) {
      return clone(fallback);
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function splitTerms(value) {
    return String(value || "")
      .split(/[,，、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function diffDays(from, to) {
    return Math.ceil((startOfDay(to) - startOfDay(from)) / 86400000);
  }

  function formatDate(date) {
    if (!date) return "待定";
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
  }

  function formatDateTime(date) {
    if (!date || Number.isNaN(date.getTime())) return "待定";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function monthKey(date) {
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(date);
  }

  function formatFileDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function money(value) {
    if (!value) return "?";
    return `€${Number(value).toLocaleString("en-US")}`;
  }

  function compactText(value, limit) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
