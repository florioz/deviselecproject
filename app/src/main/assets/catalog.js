"use strict";

let supplierCatalog = { products: [], observedAt: "", total: 0, priced: 0 };
let catalogLoading = true;
let catalogError = false;
let catalogUpdateState = { running: false, message: "" };
let catalogStatusTimer = null;
let catalogStatusRequest = 0;

async function resumeCatalogUpdates() {
  if (!window.Android || typeof Android.updateCatalog !== "function") return;
  clearTimeout(catalogStatusTimer);
  const request = ++catalogStatusRequest;
  try {
    const response = await fetch("catalog-status.json", { cache: "no-store" });
    if (!response.ok) throw new Error("État indisponible");
    const state = await response.json();
    if (request !== catalogStatusRequest) return;
    const previous = catalogUpdateState.running;
    catalogUpdateState = state;
    if (
      previous &&
      !catalogUpdateState.running &&
      catalogUpdateState.updated > 0
    )
      await initializeCatalog();
  } catch (error) {
    if (request !== catalogStatusRequest) return;
    catalogUpdateState = {
      ...catalogUpdateState,
      message: "Lecture de la progression interrompue. Réessayez.",
    };
  }
  refreshCatalogUpdatePanel();
  if (catalogUpdateState.running)
    catalogStatusTimer = setTimeout(resumeCatalogUpdates, 1000);
}

function refreshCatalogUpdatePanel() {
  if (!$("catalogUpdateMessage")) return;
  const state = catalogUpdateState;
  $("catalogUpdateMessage").textContent =
    state.message || "Actualisez les références et prix depuis 123elec.";
  $("updateSupplier").disabled =
    Boolean(state.running) ||
    !window.Android ||
    typeof Android.updateCatalog !== "function";
  $("cancelSupplierUpdate").hidden = !state.running;
  $("catalogProgress").hidden = !state.running;
  if (state.total > 0) {
    $("catalogProgress").max = state.total;
    $("catalogProgress").value = state.done || 0;
    $("catalogUpdateMessage").textContent +=
      ` ${state.done || 0} / ${state.total} pages · ${state.updated || 0} prix actualisés`;
  } else $("catalogProgress").removeAttribute("value");
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function initializeCatalog() {
  catalogLoading = true;
  catalogError = false;
  try {
    const response = await fetch("catalog-123elec.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Catalogue indisponible");
    const data = await response.json();
    if (!Array.isArray(data.products)) throw new Error("Catalogue invalide");
    const imageResponse = await fetch("equipment-images.json");
    if (imageResponse.ok) productImages = await imageResponse.json();
    data.products = data.products.map((product) => ({
      ...productImages[product.id],
      ...product,
    }));
    supplierCatalog = data;
  } catch (error) {
    catalogError = true;
  } finally {
    catalogLoading = false;
    if (tab === "catalog" && !$("dialog").open) renderCatalog();
    if ($("catalogBrowser")) renderCatalogBrowser(true);
  }
}

function catalogItems() {
  const personal = db.catalog.filter(
    (product) => product.companyId === db.active,
  );
  const sharedById = new Map(
    supplierCatalog.products.map((product) => [product.id, product]),
  );
  const hidden = new Set(
    personal.map((product) => product.sourceId).filter(Boolean),
  );
  const personalReferences = new Set(
    personal.map((product) => normalizeSearch(product.ref)).filter(Boolean),
  );
  const products = supplierCatalog.products.filter(
    (product) =>
      !hidden.has(product.id) &&
      !personalReferences.has(normalizeSearch(product.ref)),
  );

  return [
    ...personal.map((product) => {
      const source =
        sharedById.get(product.sourceId) ||
        supplierCatalog.products.find(
          (item) =>
            product.ref &&
            normalizeSearch(item.ref) === normalizeSearch(product.ref),
        );
      return {
        ...source,
        ...product,
        category: product.category || source?.category || "Mes prestations",
        brand: product.brand || source?.brand || "Mon entreprise",
      };
    }),
    ...products,
  ];
}

function favoriteIds() {
  return db.favoriteProducts?.[db.active] || [];
}

function productKey(product) {
  return product.sourceId || product.id;
}

function toggleFavorite(product) {
  if (!company()) {
    toast("Créez une entreprise pour enregistrer des favoris");
    return;
  }
  const previous = db.favoriteProducts || {};
  const ids = favoriteIds();
  const key = productKey(product);
  const next = ids.includes(key)
    ? ids.filter((id) => id !== key)
    : [...ids, key];
  db.favoriteProducts = { ...previous, [db.active]: next };
  if (!save()) db.favoriteProducts = previous;
}

function renderCatalog() {
  $("main").innerHTML = `
        <div class="row wrap"><h1>Catalogue</h1>
            <button id="newProduct">+ Ma référence</button>
        </div>
        <p class="muted" id="supplierInfo"></p>
        <section class="card">
            <h2>Actualiser 123elec</h2>
            <p class="muted">Le téléchargement complet peut prendre plusieurs minutes. Gardez l’application ouverte, de préférence en Wi-Fi.</p>
            <p id="catalogUpdateMessage" class="muted" role="status" aria-live="polite"></p>
            <progress id="catalogProgress" style="width:100%" hidden></progress>
            <div class="actions"><button type="button" id="updateSupplier">Mettre à jour 123elec</button>
                <button type="button" class="secondary" id="cancelSupplierUpdate" hidden>Annuler</button></div>
        </section>
        <section class="card" id="catalogPage"></section>`;
  $("updateSupplier").onclick = () => {
    catalogUpdateState = {
      running: true,
      message: "Connexion à 123elec…",
      done: 0,
      total: 0,
      updated: 0,
    };
    catalogStatusRequest++;
    clearTimeout(catalogStatusTimer);
    refreshCatalogUpdatePanel();
    Android.updateCatalog();
    catalogStatusTimer = setTimeout(resumeCatalogUpdates, 100);
  };
  $("cancelSupplierUpdate").onclick = () => {
    Android.cancelCatalogUpdate();
    catalogUpdateState.message = "Annulation en cours…";
    refreshCatalogUpdatePanel();
  };
  refreshCatalogUpdatePanel();
  $("newProduct").onclick = () => {
    if (!company()) {
      tab = "company";
      render();
      return;
    }
    catalogModal();
  };
  const date = supplierCatalog.observedAt
    ? new Date(supplierCatalog.observedAt + "T12:00:00").toLocaleDateString(
        "fr-FR",
      )
    : "";
  $("supplierInfo").textContent = catalogLoading
    ? "Chargement du catalogue embarqué…"
    : `${supplierCatalog.total.toLocaleString("fr-FR")} références 123elec · ${supplierCatalog.priced.toLocaleString("fr-FR")} prix renseignés · Catalogue du ${date}. Chaque prix conserve sa date de relevé. Achat HT indicatif, hors livraison.`;
  mountCatalogBrowser($("catalogPage"), false);
}

function pickCatalog() {
  if (draft) {
    draft.stage = 0;
    renderEditor();
    return;
  }
  modal(`<h2>Choisir le matériel ou la prestation</h2>
        <div id="catalogBrowser"></div>
        <div class="actions"><button type="button" class="secondary" onclick="closeModal()">Fermer</button></div>`);
  mountCatalogBrowser($("catalogBrowser"), true);
}

function filterOptions(values, label) {
  return (
    `<option value="">${esc(label)}</option>` +
    [...new Set(values.filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "fr"))
      .map((value) => `<option value="${esc(value)}">${esc(value)}</option>`)
      .join("")
  );
}

function mountCatalogBrowser(container, picker) {
  if (catalogError) {
    container.innerHTML =
      '<p class="notice">Le catalogue embarqué n’a pas pu être chargé.</p><button id="retryCatalog">Réessayer</button><div id="catalogFilters"></div>';
    $("retryCatalog").onclick = initializeCatalog;
  } else {
    container.innerHTML = '<div id="catalogFilters"></div>';
  }
  const items = catalogItems();
  $("catalogFilters").innerHTML = `
        <div class="field"><label for="catalogSearch">Nom, référence, marque ou code EAN</label>
            <input id="catalogSearch" type="search" placeholder="Ex. disjoncteur 16A, Dooxie, 600335" autocomplete="off">
        </div>
        <div class="actions catalog-collections">
            <button type="button" class="secondary" data-collection="all">Tout</button>
            <button type="button" class="secondary" data-collection="favorites">★ Mes favoris</button>
            <button type="button" class="secondary" data-collection="company">Mes références</button>
        </div>
        <div id="equipmentExplorer"></div>
        <div id="catalogRefinements"><div class="grid">
            <div class="field" id="catalogFamilyField"><label for="catalogCategory">Famille</label>
                <select id="catalogCategory">${filterOptions(
                  items.map((p) => p.category),
                  "Toutes les familles",
                )}</select></div>
            <div class="field"><label for="catalogBrand">Marque</label>
                <select id="catalogBrand">${filterOptions(
                  items.map((p) => p.brand),
                  "Toutes les marques",
                )}</select></div>
            <div class="field"><label for="catalogBudget">Budget ${picker ? "vente" : "achat"} HT / unité</label>
                <select id="catalogBudget"><option value="">Tous les budgets</option><option value="5">Jusqu’à 5 €</option>
                    <option value="15">Jusqu’à 15 €</option><option value="30">Jusqu’à 30 €</option><option value="100">Jusqu’à 100 €</option></select></div>
        </div>
        <details class="filter-details"><summary>Autres filtres</summary>
            <div class="grid filter-grid">
                <div class="field"><label for="catalogSource">Bibliothèque</label><select id="catalogSource">
                    <option value="all">Tout le catalogue</option><option value="favorites">Mes favoris</option>
                    <option value="company">Mes références et prestations</option><option value="supplier">123elec</option>
                </select></div>
                <div class="field"><label for="catalogKind">Type</label><select id="catalogKind">
                    <option value="">Tous les types</option><option value="material">Matériel</option>
                    <option value="labor">Main-d’œuvre</option><option value="service">Prestation / forfait</option>
                </select></div>
                <div class="field"><label for="catalogPrice">Prix</label><select id="catalogPrice">
                    <option value="">Tous les prix</option><option value="known">Prix renseigné</option>
                    <option value="unknown">Prix à renseigner</option>
                </select></div>
                <div class="field"><label for="catalogStock">Disponibilité relevée</label><select id="catalogStock">
                    <option value="">Toutes les disponibilités</option><option value="InStock">En stock au relevé</option>
                </select></div>
                <div class="field"><label for="catalogSort">Trier</label><select id="catalogSort">
                    <option value="relevance">Pertinence</option><option value="name">Désignation A → Z</option>
                    <option value="priceUp">Prix HT croissant</option><option value="priceDown">Prix HT décroissant</option>
                </select></div>
                <div class="field"><label for="catalogMin">Prix HT minimum (€)</label><input id="catalogMin" type="number" min="0" step="0.01"></div>
                <div class="field"><label for="catalogMax">Prix HT maximum (€)</label><input id="catalogMax" type="number" min="0" step="0.01"></div>
            </div>
        </details>
        </div><div id="catalogResultSection"><div class="row filter-summary"><p id="catalogCount" class="muted" role="status" aria-live="polite"></p>
            <button type="button" id="resetFilters" class="text-button">Réinitialiser</button></div>
        <div id="catalogResults"></div><div id="catalogMore" class="actions"></div></div>`;

  const browser = {
    picker,
    limit: 30,
    treeFamily: "",
    treeLeaf: "",
    showResults: false,
    items: items.map((product) => ({
      product,
      search: normalizeSearch(
        [
          product.label,
          product.ref,
          product.sku,
          product.brand,
          product.ean,
          product.category,
        ].join(" "),
      ),
      price: picker
        ? quoteProductPrice(product)
        : product.kind === "material"
          ? product.cost
          : product.price,
    })),
  };
  if (picker && quoteCatalogState) {
    Object.assign(browser, {
      treeFamily: quoteCatalogState.treeFamily,
      treeLeaf: quoteCatalogState.treeLeaf,
      showResults: quoteCatalogState.showResults,
    });
    for (const [id, value] of Object.entries(quoteCatalogState))
      if ($(id)) $(id).value = value;
  }
  container.querySelectorAll("[data-collection]").forEach((button) => {
    button.onclick = () => {
      $("catalogSource").value = button.dataset.collection;
      updateBrandChoices(browser);
      browser.limit = 30;
      updateCatalogResults(browser);
    };
  });
  let debounce;
  $("catalogSearch").oninput = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      browser.limit = 30;
      updateCatalogResults(browser);
    }, 100);
  };
  $("catalogBudget").onchange = () => {
    $("catalogMax").value = $("catalogBudget").value;
    $("catalogMin").value = "";
    browser.limit = 30;
    updateCatalogResults(browser);
  };
  for (const id of [
    "catalogCategory",
    "catalogBrand",
    "catalogSource",
    "catalogKind",
    "catalogPrice",
    "catalogStock",
    "catalogSort",
    "catalogMin",
    "catalogMax",
  ]) {
    $(id).onchange = () => {
      if (id === "catalogMin" || id === "catalogMax")
        $("catalogBudget").value = "";
      if (id === "catalogCategory") {
        browser.treeFamily = "";
        browser.treeLeaf = "";
        browser.showResults = true;
      }
      if (["catalogCategory", "catalogSource", "catalogKind"].includes(id))
        updateBrandChoices(browser);
      browser.limit = 30;
      updateCatalogResults(browser);
    };
  }
  $("resetFilters").onclick = () => {
    browser.treeFamily = "";
    browser.treeLeaf = "";
    browser.showResults = false;
    $("catalogFilters")
      .querySelectorAll("input")
      .forEach((input) => {
        input.value = "";
      });
    $("catalogFilters")
      .querySelectorAll("select")
      .forEach((select) => {
        select.selectedIndex = 0;
      });
    updateBrandChoices(browser);
    browser.limit = 30;
    updateCatalogResults(browser);
  };
  updateCatalogResults(browser);
}

function updateBrandChoices(browser) {
  const selected = $("catalogBrand").value;
  const category = $("catalogCategory").value;
  const source = $("catalogSource").value;
  const kind = $("catalogKind").value;
  const favorites = new Set(favoriteIds());
  const brands = browser.items
    .filter(({ product }) => {
      if (!equipmentMatches(product, browser)) return false;
      if (category && category !== product.category) return false;
      if (kind && kind !== product.kind) return false;
      if (source === "favorites") return favorites.has(productKey(product));
      if (source === "company") return Boolean(product.companyId);
      if (source === "supplier") return !product.companyId;
      return true;
    })
    .map(({ product }) => product.brand);
  $("catalogBrand").innerHTML = filterOptions(brands, "Toutes les marques");
  if (brands.includes(selected)) $("catalogBrand").value = selected;
}

function renderCatalogBrowser(picker) {
  const container = picker ? $("catalogBrowser") : $("catalogPage");
  if (container) mountCatalogBrowser(container, picker);
}

function updateCatalogResults(browser) {
  browser.items.forEach((item) => {
    item.price = browser.picker
      ? quoteProductPrice(item.product)
      : item.product.kind === "material"
        ? item.product.cost
        : item.product.price;
  });
  renderEquipmentExplorer(browser);
  rememberEquipmentState(browser);
  const query = normalizeSearch($("catalogSearch").value);
  const words = query.split(" ").filter(Boolean);
  const compactQuery = query.replace(/ /g, "");
  const category = $("catalogCategory").value;
  const brand = $("catalogBrand").value;
  const source = $("catalogSource").value;
  const kind = $("catalogKind").value;
  const priceMode = $("catalogPrice").value;
  const stock = $("catalogStock").value;
  const sort = $("catalogSort").value;
  const minimum = $("catalogMin").value;
  const maximum = $("catalogMax").value;
  const favorites = new Set(favoriteIds());
  const usage = equipmentUsage();
  document.querySelectorAll("[data-collection]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.collection === source),
    );
  });
  const filtered = browser.items.filter(({ product, search, price }) => {
    if (!equipmentMatches(product, browser)) return false;
    const known =
      price !== null && price !== undefined && Number.isFinite(Number(price));
    if (category && category !== product.category) return false;
    if (brand && brand !== product.brand) return false;
    if (kind && kind !== product.kind) return false;
    if (stock && stock !== product.availability) return false;
    if (source === "company" && !product.companyId) return false;
    if (source === "supplier" && product.companyId) return false;
    if (source === "favorites" && !favorites.has(productKey(product)))
      return false;
    if (priceMode === "known" && !known) return false;
    if (priceMode === "unknown" && known) return false;
    if (minimum !== "" && (!known || price < Number(minimum))) return false;
    if (maximum !== "" && (!known || price > Number(maximum))) return false;
    const compactSearch = search.replace(/ /g, "");
    return (
      words.every(
        (word) => search.includes(word) || compactSearch.includes(word),
      ) ||
      (compactQuery.length > 0 && compactSearch.includes(compactQuery))
    );
  });
  filtered.sort((a, b) => {
    if (sort === "priceUp" || sort === "priceDown") {
      if (a.price == null) return b.price == null ? 0 : 1;
      if (b.price == null) return -1;
      return sort === "priceUp" ? a.price - b.price : b.price - a.price;
    }
    if (sort === "relevance") {
      const score = (entry) => {
        const product = entry.product;
        const exact =
          query &&
          [product.ref, product.sku, product.ean].some(
            (value) => normalizeSearch(value) === query,
          );
        return (
          (exact ? 100 : 0) +
          (favorites.has(productKey(product)) ? 10 : 0) +
          Math.min(
            8,
            usage.get(productKey(product)) ||
              usage.get("ref:" + product.ref) ||
              0,
          ) +
          (product.companyId ? 2 : 0)
        );
      };
      const difference = score(b) - score(a);
      if (difference) return difference;
    }
    return a.product.label.localeCompare(b.product.label, "fr");
  });
  $("catalogCount").textContent = catalogLoading
    ? "Chargement du catalogue…"
    : `${filtered.length.toLocaleString("fr-FR")} résultat(s)`;
  $("catalogResults").innerHTML =
    filtered
      .slice(0, browser.limit)
      .map(({ product, price }) => {
        const known = price != null && Number.isFinite(Number(price));
        const id = esc(product.id);
        const isFavorite = favorites.has(productKey(product));
        const selected = browser.picker ? quoteProductLine(product) : null;
        return `<article class="catalog-product ${selected ? "is-selected" : ""}">
            ${equipmentPhoto(product)}
            <div class="row"><span class="muted">${esc(product.brand || "Mon entreprise")}${browser.picker ? "" : " · " + esc(product.category || "Mes prestations")}</span>
                <button type="button" class="favorite-button ${isFavorite ? "selected" : ""}" data-favorite="${id}" aria-pressed="${isFavorite}" aria-label="${isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}">${isFavorite ? "★" : "☆"}</button></div>
            <h3>${esc(product.label)}</h3>
            <p class="muted product-reference">${product.ref ? "Réf. " + esc(product.ref) : esc(product.sku || "")}${!browser.picker && product.sku && product.sku !== product.ref ? " · 123elec " + esc(product.sku) : ""}</p>
            <div class="row"><strong>${known ? money(price) + " HT / " + esc(product.unit || "u") : "Prix à renseigner"}</strong>
                ${product.checked && !browser.picker ? `<span class="muted">Relevé ${esc(product.checked.split("-").reverse().join("/"))}</span>` : ""}</div>
            <div class="actions">
                ${browser.picker ? (selected ? `<div class="inline-quantity"><button type="button" data-product-minus="${id}" class="secondary" aria-label="Diminuer ${esc(product.label)}">−</button><strong>${selected.qty}</strong><button type="button" data-pick="${id}" aria-label="Augmenter ${esc(product.label)}">+</button></div>` : `<button type="button" data-pick="${id}">Ajouter</button>`) : `<button type="button" class="secondary" data-product="${id}">${product.companyId ? "Modifier" : "Personnaliser"}</button>`}
                ${product.url && !browser.picker ? `<button type="button" class="text-button" data-link="${id}">Fiche ↗</button>` : ""}
            </div>
        </article>`;
      })
      .join("") ||
    '<p class="empty">Aucun résultat. Essayez une référence, moins de mots ou réinitialisez les filtres.</p>';
  $("catalogMore").innerHTML =
    filtered.length > browser.limit
      ? '<button type="button" class="secondary" id="moreProducts">Afficher 30 références de plus</button>'
      : "";
  if ($("moreProducts"))
    $("moreProducts").onclick = () => {
      browser.limit += 30;
      updateCatalogResults(browser);
    };
  const find = (id) =>
    browser.items.find((entry) => entry.product.id === id)?.product;
  wireEquipmentPhotos($("catalogResults"));
  $("catalogResults")
    .querySelectorAll("[data-pick]")
    .forEach((button) => {
      button.onclick = () => {
        const product = find(button.dataset.pick);
        const c = company();
        if (!c) {
          toast("Créez votre entreprise pour préparer un devis");
          return;
        }
        quickAddProduct(product);
        updateCatalogResults(browser);
      };
    });
  $("catalogResults")
    .querySelectorAll("[data-product-minus]")
    .forEach((button) => {
      button.onclick = () => {
        quickAddProduct(find(button.dataset.productMinus), -1);
        updateCatalogResults(browser);
      };
    });
  $("catalogResults")
    .querySelectorAll("[data-product]")
    .forEach((button) => {
      button.onclick = () => {
        if (!company()) {
          toast("Créez votre entreprise pour personnaliser une référence");
          return;
        }
        catalogModal(find(button.dataset.product));
      };
    });
  $("catalogResults")
    .querySelectorAll("[data-favorite]")
    .forEach((button) => {
      button.onclick = () => {
        toggleFavorite(find(button.dataset.favorite));
        updateCatalogResults(browser);
      };
    });
  $("catalogResults")
    .querySelectorAll("[data-link]")
    .forEach((button) => {
      button.onclick = () => openProductPage(find(button.dataset.link).url);
    });
}

function openProductPage(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "www.123elec.com")
      return;
    if (window.Android) Android.product(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  } catch (error) {
    toast("Lien produit invalide");
  }
}

function catalogModal(product) {
  const c = company();
  const p = product || {
    kind: "material",
    unit: "u",
    label: "",
    ref: "",
    cost: 0,
    price: 0,
    url: "",
    checked: "",
    category: "",
    brand: "",
  };
  const categories = [
    ...new Set(supplierCatalog.products.map((item) => item.category)),
  ];
  if (p.category && !categories.includes(p.category))
    categories.push(p.category);
  modal(`<h2>${p.companyId ? "Modifier ma référence" : "Personnaliser ma référence"}</h2>
        <form id="productForm"><div class="grid">
            ${field("label", "Désignation *", p.label, "text", "required")}
            ${select(
              "kind",
              "Type",
              [
                ["material", "Matériel"],
                ["service", "Prestation / forfait"],
                ["labor", "Main-d’œuvre"],
              ],
              p.kind,
            )}
            ${field("ref", "Référence fabricant", p.ref)}
            ${field("brand", "Marque", p.brand)}
            ${select("category", "Famille", [["Mes prestations", "Mes prestations"], ...categories.map((value) => [value, value])], p.category || "Mes prestations")}
            ${select(
              "unit",
              "Unité vendue",
              [
                ["u", "Unité / conditionnement indiqué"],
                ["m", "Mètre"],
                ["h", "Heure"],
                ["forfait", "Forfait"],
                ["lot", "Lot"],
              ],
              p.unit,
            )}
            ${field("cost", "Prix d’achat unitaire HT (€)", p.cost ?? "", "number", `min="${p.cost == null ? "0.01" : "0"}" step="0.01" required`)}
            ${field("price", "Prix de vente HT (prestation / heure)", p.price || 0, "number", 'min="0" step="0.01" required')}
            ${field("url", "Lien produit 123elec", p.url, "url")}
            ${field("checked", "Prix vérifié le", p.checked, "date")}
        </div><p class="muted">Le matériel utilise la majoration de votre entreprise à l’ajout au devis. Respectez le conditionnement de la fiche produit.</p>
        <div class="actions"><button type="submit">Enregistrer ma référence</button>
            <button type="button" class="secondary" onclick="closeModal()">Annuler</button></div></form>`);
  $("productForm").onsubmit = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const next = {
      ...p,
      ...values,
      id: p.companyId ? p.id : uid(),
      companyId: c.id,
      sourceId: p.sourceId || (p.id && !p.companyId ? p.id : undefined),
      cost: Number(values.cost),
      price: Number(values.price),
    };
    const previous = db.catalog;
    db.catalog = p.companyId
      ? previous.map((item) => (item.id === p.id ? next : item))
      : [...previous, next];
    if (!save()) {
      db.catalog = previous;
      return;
    }
    closeModal();
    renderCatalog();
    toast("Référence enregistrée pour votre entreprise");
  };
  addSuggestions(
    $("f-brand"),
    [...new Set(supplierCatalog.products.map((item) => item.brand))],
    "catalogBrands",
  );
}
