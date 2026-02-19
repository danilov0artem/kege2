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
    const res = await fetch(`https://kompege.ru/api/v1/task/${id}`);
    if (!res.ok) throw new Error(`Ошибка загрузки задачи ${id}`);
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
      return `<a class="file-link" href="${href}"${downloadAttr}>${title}</a>`;
    }).join(", ");

    return `<div class="task-files-inline">Файлы к заданию: ${links}</div>`;
  }

  function extractFilesFromKompege(data) {
  const arr = Array.isArray(data?.files) ? data.files : [];
  return arr
    .filter(f => f && f.url)
    .map(f => ({
      url: new URL(f.url, "https://kompege.ru").href,
      name: f.name || "",
      title: f.name || "Файл"
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
  themeBlock.className = "theme-block";

  const anchor = document.createElement("div");
  anchor.id = themeAnchors[i];
  anchor.className = "anchor-offset";
  themeBlock.appendChild(anchor);

  const title = document.createElement("h2");
  title.className = "theme-title";
  title.textContent = theme?.title ?? `Тема ${i + 1}`;
  themeBlock.appendChild(title);

  (theme.tasks || []).forEach((t) => {

    // 1) Теория
    if (t && t.type === "theory") {
      const block = document.createElement("div");
      block.className = "task theory-block";
      block.innerHTML = `
        ${t.title ? `<h3>${t.title}</h3>` : ""}
        <div class="task-text">${t.text || ""}</div>
      `;
      themeBlock.appendChild(block);
      return;
    }

    // 2) Обычная задача
    globalIndex++;

    const source = t.source || "kompege";

    const taskEl = document.createElement("article");
    taskEl.className = "task";
    taskEl.id = `task-${String(t.id)}`;

    taskEl.innerHTML = `
      <h3>${globalIndex}. ${t.title || ""}${
        source === "kompege"
          ? ` <span class="muted">(задача ${t.id} с kompege.ru)</span>`
          : ""
      }</h3>
    `;

    themeBlock.appendChild(taskEl);
  });

  themesRoot.appendChild(themeBlock);
});



    // 4) Подставляем контент
    const allTasks = THEMES.flatMap(t => t.tasks || []).filter(t => !(t && t.type === "theory"));
    const promises = allTasks.map(async (t) => {
      const host = document.getElementById(`task-${String(t.id)}`);
      if (!host) return;

      const headerText = host.querySelector("h3")?.textContent ?? "";
      const source = t.source || "kompege";

      try {
        let data;

        if (source === "local") {
          const item = localDict[String(t.id)];
          if (!item) throw new Error(`Локальная задача не найдена: ${t.id}`);
          data = { text: item.text ?? "", key: item.key ?? "", files: item.files ?? [] };
        } else {
          data = await loadKompegeTask(t.id);
          data.files = extractFilesFromKompege(data);
        }


        host.innerHTML = `
          <h3>${headerText}</h3>
          <div class="task-text">${data.text ?? ""}</div>
          ${renderFiles(data.files)}

          <button class="btn" type="button" data-action="toggle-answer" data-id="${String(t.id)}">
            Показать ответ
          </button>
          <div class="answer hidden" id="answer-${String(t.id)}">
            <p>${data.key ?? ""}</p>
          </div>
        `;

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
  });
})();
