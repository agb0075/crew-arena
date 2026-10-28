(function () {
  const STORAGE_KEY = "todo-tasks-v1";

  const form = document.getElementById("task-form");
  const input = document.getElementById("task-input");
  const list = document.getElementById("task-list");
  const emptyMsg = document.getElementById("empty-msg");
  const counter = document.getElementById("counter");
  const clearDoneBtn = document.getElementById("clear-done");

  let tasks = load();

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(data) ? data : [];
    } catch (err) {
      return [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  function render() {
    list.innerHTML = "";

    tasks.forEach(function (task) {
      const li = document.createElement("li");
      if (task.done) li.classList.add("done");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = task.done;
      checkbox.addEventListener("change", function () {
        task.done = checkbox.checked;
        save();
        render();
      });

      const text = document.createElement("span");
      text.className = "task-text";
      text.textContent = task.text; // textContent evita inyección de HTML

      const del = document.createElement("button");
      del.type = "button";
      del.className = "delete-btn";
      del.textContent = "Eliminar";
      del.addEventListener("click", function () {
        tasks = tasks.filter(function (t) { return t.id !== task.id; });
        save();
        render();
      });

      li.append(checkbox, text, del);
      list.appendChild(li);
    });

    const pending = tasks.filter(function (t) { return !t.done; }).length;
    emptyMsg.style.display = tasks.length === 0 ? "block" : "none";
    counter.textContent = pending + " pendiente(s) de " + tasks.length;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    tasks.push({ id: Date.now() + Math.random(), text: text, done: false });
    input.value = "";
    save();
    render();
    input.focus();
  });

  clearDoneBtn.addEventListener("click", function () {
    tasks = tasks.filter(function (t) { return !t.done; });
    save();
    render();
  });

  render();
})();
