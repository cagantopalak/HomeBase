/* ---------- CONTEXT MENUS ---------- */
// One menu element, rebuilt from a list of items each time it opens. Before v3 the same
// markup was written out in three places and the click handlers were re-attached to
// whichever copy of the buttons had been created last.

(function (root) {
  const ICONS = {
    open: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link-icon lucide-external-link"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    edit: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-pen-icon lucide-square-pen"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>',
    delete:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  };

  // Parsed once and cloned per button. Keeps the static markup out of innerHTML, which the
  // add-on validator flags wherever it appears.
  const iconNodes = {};
  function icon(name) {
    if (!iconNodes[name]) {
      const doc = new DOMParser().parseFromString(ICONS[name], "image/svg+xml");
      iconNodes[name] = doc.documentElement;
    }
    return iconNodes[name].cloneNode(true);
  }

  let menu = null;
  const dismissers = [];

  // newtab.html already carries an empty menu container. Before v3 nothing used it and a
  // second one was built at runtime, so the page ended up with two.
  function element() {
    if (!menu) {
      menu = document.getElementById("tileContextMenu");
      if (!menu) {
        menu = document.createElement("div");
        menu.className = "context-menu";
        menu.id = "tileContextMenu";
        document.body.appendChild(menu);
      }
    }
    return menu;
  }

  function pageMenu() {
    return document.getElementById("editButtonContextMenu");
  }

  // items: [{ id, icon, label, onClick }]
  function show(items, x, y) {
    hideAll();
    const el = element();
    el.textContent = "";

    items.forEach((item) => {
      const button = document.createElement("button");
      if (item.id) button.id = item.id;
      if (item.icon) button.appendChild(icon(item.icon));
      button.appendChild(document.createTextNode(" " + item.label));
      button.addEventListener("click", (e) => {
        e.preventDefault();
        hideAll();
        item.onClick();
      });
      el.appendChild(button);
    });

    el.style.top = y + "px";
    el.style.left = x + "px";
    el.style.display = "block";
  }

  // The menu the page shows on a right click over empty space. Its buttons live in
  // newtab.html rather than being built here.
  function showPageMenu(x, y) {
    hideAll();
    const el = pageMenu();
    if (!el) return;
    el.style.top = y + "px";
    el.style.left = x + "px";
    el.style.display = "block";
  }

  // Hides only the page menu. A right click that lands on a tile has already opened the
  // tile's own menu by the time it reaches the page handler, so that one must survive.
  function hidePageMenu() {
    const el = pageMenu();
    if (el) el.style.display = "none";
  }

  function hideAll() {
    if (menu) menu.style.display = "none";
    hidePageMenu();
    dismissers.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error("dismiss failed:", err && err.message);
      }
    });
  }

  // Modules that own a modal which should close when a menu opens or the page is clicked
  // register here. Before v3 this list was hardcoded into hideAllContextMenus().
  function onDismiss(fn) {
    dismissers.push(fn);
  }

  root.HomeBaseMenu = { show, showPageMenu, hideAll, hidePageMenu, onDismiss, icon };
})(window);
