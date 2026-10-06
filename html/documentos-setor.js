(() => {
  const search = document.getElementById("document-search");
  if (!search) return;
  let sector = new URLSearchParams(window.location.search).get("setor") || "";
  const cards = [...document.querySelectorAll(".doc-card")];
  const title = document.querySelector(".panel-heading h1");
  const links = [...document.querySelectorAll(".sector-link")];
  let technicianOnly = document.documentElement.dataset.accessProfile === "tecnicos";

  links.forEach((link) => {
    const linkSector = link.dataset.setor || "";
    const count = cards.filter((card) => !linkSector || card.dataset.setor === linkSector).length;
    const countElement = link.querySelector(".sector-count");
    if (countElement) countElement.textContent = count;
  });

  function applyFilters() {
    if (technicianOnly) sector = "Técnicos";
    const query = search.value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    cards.forEach((card) => {
      const matchesSector = !sector || card.dataset.setor === sector;
      const text = card.textContent.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      card.hidden = !matchesSector || (query !== "" && !text.includes(query));
    });
    links.forEach((link) => {
      const linkSector = link.dataset.setor || "";
      link.classList.toggle("active", linkSector === sector);
    });
    if (title) title.textContent = sector || "Todos os Documentos";
  }

  function applyTechnicianView() {
    technicianOnly = true;
    sector = "Técnicos";
    document.body.classList.add("technician-view");

    document.querySelectorAll("#menu li").forEach((item) => {
      const link = item.querySelector("a");
      const isDocumentsLink = link?.getAttribute("href") === "documentos.html";
      const isLogoutLink = link?.classList.contains("logout-btn");
      item.hidden = !isDocumentsLink && !isLogoutLink;
    });

    const logo = document.querySelector(".navbar-logo");
    if (logo?.tagName === "A") logo.setAttribute("href", "documentos.html");
    applyFilters();
  }

  window.filtrarDocumentos = (value) => {
    search.value = value;
    applyFilters();
  };

  document.querySelectorAll(".sector-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      sector = link.dataset.setor || "";
      const url = new URL(window.location.href);
      if (sector) url.searchParams.set("setor", sector);
      else url.searchParams.delete("setor");
      window.history.pushState({}, "", url);
      applyFilters();
    });
  });

  search.addEventListener("input", () => applyFilters());
  search.addEventListener("keyup", () => applyFilters());
  search.addEventListener("search", () => applyFilters());
  window.addEventListener("popstate", () => {
    sector = technicianOnly ? "Técnicos" : new URLSearchParams(window.location.search).get("setor") || "";
    applyFilters();
  });
  window.addEventListener("tecnicos:perfil", applyTechnicianView);
  if (technicianOnly) applyTechnicianView();
  applyFilters();
})();
