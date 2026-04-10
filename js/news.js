async function loadNews() {
  const container = document.getElementById("newsList");

  try {
    const res = await fetch("data/news.json");
    const news = await res.json();

    news.forEach(item => {
      const div = document.createElement("div");
      div.className = "news-item";

      div.innerHTML = `
        <div class="news-date">${item.date}</div>
        <div class="news-text">${item.text}</div>
      `;

      container.appendChild(div);
    });

  } catch (e) {
    container.innerHTML = "Не удалось загрузить новости";
  }
}

loadNews();