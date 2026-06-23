// Начальная тема применяется ещё до отрисовки — инлайн-скриптом в <head>
// (класс "dark" на <html>), чтобы не было мерцания (FOUC). Здесь — только
// переключение по кнопке и сохранение выбора пользователя.
document.addEventListener("DOMContentLoaded", () => {
  const root = document.documentElement;
  const toggleBtn = document.getElementById("themeToggle");
  if (!toggleBtn) return;

  toggleBtn.addEventListener("click", () => {
    const isDark = root.classList.toggle("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
  });
});
