(function () {
  function slugify(s) {
    return String(s)
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-z0-9а-я\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);
  }

  async function loadKompegeTask(id) {
    const res = await fetch(`https://api.kege2.ru/api/task/${id}`);
    if (!res.ok) throw new Error(id);
    return await res.json();
}

  async function loadLocalDict(url) {
    if (!url) return {};
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Ошибка загрузки задачи ${url}`);
    return await res.json();
  }

  function renderFiles(files) {
    if (!Array.isArray(files) || files.length === 0) return "";

    const links = files.map(f => {
      const title = f.title || f.name || "файл";
      const href = f.url;
      const downloadAttr = f.name ? ` download="${String(f.name)}"` : " download";
      return `<a class="file-link" href="${href}" download="${title}" target="_blank">${title}</a>`;
    }).join(", ");

    return `<div class="task-files-inline">Файлы к заданию: ${links}</div>`;
  }

  function extractFilesFromKompege(data) {
    const arr = Array.isArray(data?.files) ? data.files : [];
    return arr
        .filter(f => f && f.url)
        .map(f => ({
            // Если ссылка уже начинается с http/https (наша новая ссылка), оставляем её.
            // Иначе (на всякий случай) приклеиваем старый домен.
            url: f.url.startsWith('http') ? f.url : new URL(f.url, 'https://kompege.ru').href,
            name: f.name || '',
            title: f.name || ''
        }));
}

  document.addEventListener("DOMContentLoaded", async () => {
    const config = window.TASK_PAGE_CONFIG || {};
    const THEMES = Array.isArray(config.themes) ? config.themes : [];

    const toc = document.getElementById("toc");
    const themesRoot = document.getElementById("themesRoot");
    const pageTitle = document.getElementById("pageTitle");

    if (!toc || !themesRoot) return;

    if (pageTitle && config.pageTitle) {
      pageTitle.textContent = config.pageTitle;
      document.title = config.pageTitle;
    }

    // 0) Один раз грузим JSON со своими задачами
    let localDict = {};
    try {
      localDict = await loadLocalDict(config.localTasksUrl);
    } catch (e) {
      console.error(e);
      localDict = {};
    }

    // 1) Якоря для тем
    const usedAnchors = new Set();
    const themeAnchors = THEMES.map((theme, i) => {
      const themeTitle = theme?.title ?? `Тема ${i + 1}`;
      let base = `theme-${i + 1}-${slugify(themeTitle)}`;
      let anchor = base;
      let k = 2;
      while (usedAnchors.has(anchor)) anchor = `${base}-${k++}`;
      usedAnchors.add(anchor);
      return anchor;
    });

    // 2) Содержание
    toc.innerHTML = THEMES.map((theme, i) => {
      const themeTitle = theme?.title ?? `Тема ${i + 1}`;
      return `<li><a class="social-link toc-link" href="#${themeAnchors[i]}">${themeTitle}</a></li>`;
    }).join("");

    // 3) Плейсхолдеры
themesRoot.innerHTML = "";
let globalIndex = 0;

THEMES.forEach((theme, i) => {
  const themeBlock = document.createElement("div");
  themeBlock.className = "theme-block collapsed";

  const anchor = document.createElement("div");
  anchor.id = themeAnchors[i];
  anchor.className = "anchor-offset";
  themeBlock.appendChild(anchor);

  const title = document.createElement("h2");
  title.className = "theme-title";
  title.textContent = theme?.title ?? `Тема ${i + 1}`;

  title.addEventListener("click", () => {
      const isCollapsed = themeBlock.classList.contains("collapsed");
      if (isCollapsed) {
          // Раскрытие: анимируем от 0 до фактической высоты, затем снимаем ограничение,
          // чтобы содержимое могло расти (например, при раскрытии ответов).
          tasksContainer.style.maxHeight = "0px";
          themeBlock.classList.remove("collapsed");
          void tasksContainer.offsetHeight; // форсируем reflow
          tasksContainer.style.maxHeight = tasksContainer.scrollHeight + "px";
          const onEnd = (e) => {
              if (e.propertyName !== "max-height") return;
              tasksContainer.style.maxHeight = "";
              tasksContainer.removeEventListener("transitionend", onEnd);
          };
          tasksContainer.addEventListener("transitionend", onEnd);
      } else {
          // Сворачивание: фиксируем текущую высоту, затем анимируем до 0.
          tasksContainer.style.maxHeight = tasksContainer.scrollHeight + "px";
          void tasksContainer.offsetHeight; // форсируем reflow
          themeBlock.classList.add("collapsed");
          tasksContainer.style.maxHeight = "0px";
      }
  });

  themeBlock.appendChild(title);

  // Контейнер для задач (для аккордеона)
  const tasksContainer = document.createElement("div");
  tasksContainer.className = "theme-tasks";

  (theme.tasks || []).forEach((t) => {

    // 1) Теория
    if (t && t.type === "theory") {
      const block = document.createElement("div");
      block.className = "task theory-block";
      block.innerHTML = `
        ${t.title ? `<h3>${t.title}</h3>` : ""}
        <div class="task-text">${t.text || ""}</div>
      `;
      tasksContainer.appendChild(block);
      return;
    }

    // 2) Обычная задача
    globalIndex++;

    const source = t.source || "kompege";

    const taskEl = document.createElement("article");
    taskEl.className = "task";
    t.uniqueId = `task-${globalIndex}-${String(t.id)}`
    taskEl.id = t.uniqueId

    taskEl.innerHTML = `
      <h3>${globalIndex}. ${t.title || ""}${
        source === "kompege"
          ? ` <span class="muted">(задача ${t.id} с kompege.ru)</span>`
          : ""
      }</h3>
    `;

    tasksContainer.appendChild(taskEl);
  });

  themeBlock.appendChild(tasksContainer);
  themesRoot.appendChild(themeBlock);  // ← эта строка была удалена случайно!
});

    // 4) Подставляем контент
    const allTasks = THEMES
      .flatMap(t => t.tasks || [])
      .filter(t => !(t && t.type === "theory"));

    const promises = allTasks.map(async (t) => {
      const host = document.getElementById(t.uniqueId)
      if (!host) return;

      const headerText = host.querySelector("h3")?.textContent ?? "";
      const source = t.source || "kompege";

      try {
        let data;

        if (source === "local") {
          const item = localDict[String(t.id)];
          if (!item) throw new Error(`Локальная задача не найдена: ${t.id}`);
          data = {
            text: item.text ?? "",
            key: item.key ?? "",
            files: item.files ?? [],
            subTask: item.subTask ?? []
          };
        } else {
          data = await loadKompegeTask(t.id);
          data.files = extractFilesFromKompege(data);
        }
        const taskText = (data.text || "").replace(/<a[^>]*>|<\/a>/gi, "");
        
        // Блок основной задачи (19)
        let html = `
          <h3>${headerText}</h3>
          <div class="task-text">${taskText}</div> 
          ${renderFiles(data.files)}

          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn" type="button" data-action="toggle-answer" data-id="${t.uniqueId}">
              Показать ответ
            </button>
             <a href="/tasks/ask_question.html" target="_blank" class="btn task-btn">Задать вопрос по задаче</a>
          </div>

          <div class="answer hidden" id="answer-${t.uniqueId}">
            <p>${data.key ?? ""}</p>
          </div>
        `;

        // Если есть подзадачи (20 и 21)
        if (Array.isArray(data.subTask) && data.subTask.length > 0) {
          html += `<div class="task" style="margin-top: 18px;">`;

          data.subTask.forEach((st, idx) => {
            const subNumber = st.number ?? (19 + idx + 1);
            const subId = `${t.uniqueId}-sub-${idx + 1}`;
            
            // 2. Очищаем текст подзадачи
            const subTaskText = (st.text || "").replace(/<a[^>]*>|<\/a>/gi, "");
            
            html += `
              <div style="margin-top:${idx === 0 ? 0 : 14}px;">
                <h3>Задание ${subNumber}</h3>
                <div class="task-text">${subTaskText}</div> 
                ${st.key ? `
                  <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button class="btn" type="button" data-action="toggle-answer" data-id="${subId}">
                      Показать ответ
                    </button>
                     <a href="/tasks/ask_question.html" target="_blank" class="btn task-btn">Задать вопрос по задаче</a>
                  </div>
                  <div class="answer hidden" id="answer-${subId}">
                    <p>${st.key}</p>
                  </div>
                ` : ""}
              </div>
            `;
          });

          html += `</div>`;
        }

        host.innerHTML = html;

        if (window.MathJax && window.MathJax.typesetPromise) {
          await window.MathJax.typesetPromise([host]);
        }
      } catch (e) {
        host.innerHTML = `
          <h3>${headerText || "Задача"}</h3>
          <p style="color:red;">${e.message}</p>
        `;
      }
    });


    await Promise.allSettled(promises);

    // 5) Кнопки “Показать ответ”
    themesRoot.addEventListener("click", (e) => {
      const btn = e.target.closest('button[data-action="toggle-answer"]');
      if (!btn) return;

      const id = btn.dataset.id;
      const ans = document.getElementById(`answer-${id}`);
      if (!ans) return;

      ans.classList.toggle("hidden");
      btn.textContent = ans.classList.contains("hidden") ? "Показать ответ" : "Скрыть ответ";
    });

    // 6) Плавающая кнопка “Наверх”
    const scrollTopBtn = document.createElement("button");
    scrollTopBtn.type = "button";
    scrollTopBtn.className = "scroll-top-btn";
    scrollTopBtn.setAttribute("aria-label", "Наверх");
    scrollTopBtn.title = "Наверх";
    scrollTopBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path d="M12 5l7 7-1.4 1.4L13 8.83V19h-2V8.83l-4.6 4.57L5 12z" fill="currentColor"/>
      </svg>
    `;
    document.body.appendChild(scrollTopBtn);

    const toggleScrollTop = () => {
      scrollTopBtn.classList.toggle("visible", window.scrollY > 300);
    };
    toggleScrollTop();
    window.addEventListener("scroll", toggleScrollTop, { passive: true });

    scrollTopBtn.addEventListener("click", () => {
      const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
    });
  });
})();
