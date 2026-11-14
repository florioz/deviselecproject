"use strict";

function renderEditor() {
  document.body.dataset.quoteMode = "true";
  if (isQuoteLocked(draft)) return renderLockedQuote();
  const stage = Math.max(0, Math.min(2, Number(draft.stage) || 0));
  draft.stage = stage;
  $("main").innerHTML =
    `<div class="row"><div><p class="muted">${esc(draft.number)}</p><h1>Mon devis</h1></div>
        <button id="back" class="secondary">Fermer</button></div>
        <div class="quote-status-bar"><span class="pill">${esc(draft.status || "Brouillon")}${draft.revision ? " · Version " + draft.revision : ""}</span><button id="changeQuoteStatus" class="text-button">Modifier le statut</button></div>
        <div class="quote-steps" aria-label="Étapes du devis">
            ${["Matériel", "Client et chantier", "Conditions et PDF"]
              .map(
                (label, index) =>
                  `<button type="button" data-stage="${index}" aria-current="${index === stage ? "step" : "false"}">${label}</button>`,
              )
              .join("")}
        </div><div id="quoteStage"></div>`;
  document
    .querySelector('[aria-current="step"]')
    ?.scrollIntoView({ block: "nearest", inline: "center" });
  $("back").onclick = () => {
    capture();
    if (!storeQuote(true)) return;
    draft = null;
    renderQuotes();
  };
  $("changeQuoteStatus").onclick = openQuoteStatusDialog;
  document.querySelectorAll("[data-stage]").forEach((button) => {
    button.onclick = () => changeQuoteStage(Number(button.dataset.stage));
  });
  if (stage === 0) renderMaterialStage();
  else if (stage === 1) renderClientStage();
  else renderQuoteReview();
}

function changeQuoteStage(stage) {
  if (isQuoteLocked(draft)) return;
  capture();
  if (stage > 0 && !draft.lines.length) {
    toast("Choisissez au moins un équipement ou une prestation");
    return;
  }
  if (stage === 2) {
    if ($("quoteForm") && !$("quoteForm").reportValidity()) return;
    if (!draft.client || !draft.clientAddress.trim()) {
      draft.stage = 1;
      renderEditor();
      toast("Choisissez un client avec une adresse complète");
      return;
    }
  }
  draft.stage = stage;
  if (!storeQuote(true)) return;
  renderEditor();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function storeQuote(quiet = false, options = {}) {
  if (!draft) return false;
  if (db.quotes.find((quote) => quote.id === draft.id)?.locked) return true;
  const previous = db.quotes;
  const c = company();
  const counter = c.nextNumber;
  const exists = previous.some((quote) => quote.id === draft.id);
  draft.updated = new Date().toISOString();
  db.quotes = exists
    ? previous.map((quote) =>
        quote.id === draft.id ? structuredClone(draft) : quote,
      )
    : [...previous, structuredClone(draft)];
  if (!exists) c.nextNumber++;
  if (!save(options)) {
    db.quotes = previous;
    c.nextNumber = counter;
    return false;
  }
  if (!quiet) toast("Devis enregistré");
  return true;
}

function renderMaterialStage() {
  $("quoteStage").innerHTML =
    `<div class="material-heading row wrap"><h2>Choisir le matériel</h2>
        <button id="addLine" class="text-button">+ Matériel ou prestation hors catalogue</button></div>
        <section class="card" id="catalogBrowser"></section>
        <div class="selection-bar"><button id="selectionButton" class="secondary"></button>
            <div><small>Total TTC</small><strong id="selectionTotal"></strong></div>
            <button id="nextStage">Client et chantier →</button></div>`;
  $("addLine").onclick = () => lineModal();
  $("selectionButton").onclick = showQuoteSelection;
  $("nextStage").onclick = () => changeQuoteStage(1);
  mountCatalogBrowser($("catalogBrowser"), true);
  mountWorkTools();
  refreshSelectionSummary();
}

function refreshSelectionSummary() {
  if (!$("selectionButton") || !draft) return;
  $("selectionButton").closest(".selection-bar").hidden =
    draft.lines.length === 0;
  $("selectionButton").textContent = `Ma sélection (${draft.lines.length})`;
  $("selectionTotal").textContent = money(totals(draft).ttc);
  $("selectionTotal").previousElementSibling.textContent = draft.lines.some(
    (line) => line.needsPrice,
  )
    ? "TTC provisoire · prix manquant"
    : "Total TTC";
}

function quoteProductLine(product) {
  return draft?.lines.find(
    (line) =>
      line.catalogId === productKey(product) &&
      (line.room || "") === (draft.activeRoom || "") &&
      line.unit === (product.unit || "u"),
  );
}

function quoteProductPrice(product) {
  const existing = quoteProductLine(product);
  if (existing) return existing.needsPrice ? null : existing.price;
  return productSalePrice(product);
}

function quickAddProduct(product, delta = 1) {
  if (isQuoteLocked(draft)) return;
  const existing = quoteProductLine(product);
  if (existing) {
    existing.qty = roundQuantity(existing.qty + delta);
    if (existing.qty <= 0) draft.lines.splice(draft.lines.indexOf(existing), 1);
  } else if (delta > 0) {
    if (product.kind === "material" && product.cost == null) {
      lineModal(undefined, {
        ...product,
        catalogId: productKey(product),
        qty: 1,
        price: 0,
        markup: company().markup,
        vat: draft.defaultVat ?? company().vat,
        room: draft.activeRoom || "",
      });
      return;
    }
    draft.lines.push({
      ...product,
      catalogId: productKey(product),
      qty: 1,
      price: quoteProductPrice(product),
      markup: company().markup,
      vat: draft.defaultVat ?? company().vat,
      room: draft.activeRoom || "",
    });
  }
  storeQuote(true);
  refreshSelectionSummary();
}

function showQuoteSelection() {
  if ($("dialog").open) closeModal();
  modal(`<h2>Ma sélection</h2><div id="selectedLines">${
    draft.lines
      .map(
        (line, index) =>
          `<article class="selected-line"><p class="muted">${esc(line.room || "Ensemble du chantier")}</p><div class="selected-product">${equipmentPhoto(line)}<strong>${esc(line.label)}</strong></div>
            <div class="row"><span>${line.needsPrice ? "Prix à compléter dans Conditions et PDF" : money(line.price) + " HT / " + esc(line.unit)}</span>
                <div class="inline-quantity"><button class="secondary" data-line-delta="-1" data-index="${index}" aria-label="Diminuer ${esc(line.label)}">−</button>
                    <strong>${line.qty}</strong><button class="secondary" data-line-delta="1" data-index="${index}" aria-label="Augmenter ${esc(line.label)}">+</button></div></div>
            <button class="text-button" data-edit-line="${index}">Détails / prix / supprimer</button></article>`,
      )
      .join("") || '<p class="empty">Votre sélection est vide.</p>'
  }</div>
        <div class="actions"><button id="closeSelection" class="secondary">${draft.stage === 2 ? "Retour aux conditions" : "Continuer le matériel"}</button>
            <button id="selectionNext">${draft.stage === 2 ? "Modifier le matériel" : "Client et chantier →"}</button></div>`);
  wireEquipmentPhotos($("dialog"));
  $("closeSelection").onclick = closeModal;
  $("selectionNext").onclick = () => {
    closeModal();
    changeQuoteStage(draft.stage === 2 ? 0 : 1);
  };
  $("dialog")
    .querySelectorAll("[data-line-delta]")
    .forEach((button) => {
      button.onclick = () => {
        const index = Number(button.dataset.index);
        draft.lines[index].qty = roundQuantity(
          draft.lines[index].qty + Number(button.dataset.lineDelta),
        );
        if (draft.lines[index].qty <= 0) draft.lines.splice(index, 1);
        storeQuote(true);
        refreshSelectionSummary();
        showQuoteSelection();
      };
    });
  $("dialog")
    .querySelectorAll("[data-edit-line]")
    .forEach((button) => {
      button.onclick = () => {
        closeModal();
        lineModal(Number(button.dataset.editLine));
      };
    });
}

function renderClientStage() {
  const clients = companyClients();
  const selectedId =
    draft.clientId ||
    clients.find(
      (client) =>
        client.name === draft.client && client.address === draft.clientAddress,
    )?.id ||
    "";
  const sameAddress = !draft.site || draft.site === draft.clientAddress;
  $("quoteStage").innerHTML =
    `<form id="quoteForm" class="card"><h2>Pour quel client ?</h2>
        <input id="quoteClient" name="clientId" type="hidden" value="${esc(selectedId)}">
        <button type="button" id="chooseQuoteClient" class="secondary">${draft.client ? "Changer de client" : "Rechercher un client"}</button>
        <button type="button" id="createQuoteClient" class="text-button">+ Créer un client dans le carnet</button>
        <div id="quoteClientSummary" class="client-summary"></div>
        <h2>Le chantier</h2>${field("title", "Objet du devis *", draft.title, "text", 'required list="quoteSubjects"')}
        <datalist id="quoteSubjects">${["Rénovation électrique", "Installation électrique neuve", "Mise en sécurité électrique", "Remplacement de tableau électrique", "Ajout de prises et interrupteurs", "Installation d’éclairage", "Dépannage électrique"].map((value) => `<option value="${esc(value)}"></option>`).join("")}</datalist>
        <label class="check-label"><input id="sameClientAddress" type="checkbox" ${sameAddress ? "checked" : ""}> Chantier à l’adresse du client</label>
        <div id="siteField" ${sameAddress ? "hidden" : ""}>${area("site", "Adresse du chantier", draft.site || draft.clientAddress)}</div>
        <div class="actions"><button type="button" id="previousStage" class="secondary">← Matériel</button><button type="submit">Conditions et PDF →</button></div></form>`;
  addClosedChoices(
    $("f-title"),
    [
      "Travaux électriques",
      "Rénovation électrique",
      "Installation électrique neuve",
      "Mise en sécurité électrique",
      "Remplacement de tableau électrique",
      "Ajout de prises et interrupteurs",
      "Installation d’éclairage",
      "Dépannage électrique",
    ],
    "quoteSubjectChoice",
    "Objet personnalisé…",
  );
  const summary = () => {
    $("quoteClientSummary").innerHTML = draft.client
      ? `<strong>${esc(draft.client)}</strong><p>${esc(draft.clientAddress).replace(/\n/g, "<br>")}</p><span class="muted">${esc(draft.email)}</span>`
      : "";
  };
  summary();
  $("chooseQuoteClient").onclick = () =>
    openClientPicker($("quoteClient").value, (client) => {
      capture();
      applyClientToQuote(client);
      $("quoteClient").value = client.id;
      $("chooseQuoteClient").textContent = "Changer de client";
      if ($("sameClientAddress").checked) {
        draft.site = client.address;
        $("f-site").value = client.address;
      }
      summary();
      storeQuote(true);
    });
  $("sameClientAddress").onchange = () => {
    $("siteField").hidden = $("sameClientAddress").checked;
    if ($("sameClientAddress").checked) $("f-site").value = draft.clientAddress;
    capture();
  };
  $("createQuoteClient").onclick = createClientForQuote;
  $("previousStage").onclick = () => changeQuoteStage(0);
  $("quoteForm").onchange = capture;
  $("quoteForm").onsubmit = (event) => {
    event.preventDefault();
    changeQuoteStage(2);
  };
}

function renderQuoteReview() {
  $("quoteStage").innerHTML =
    `<section class="card review-client"><h2>${esc(draft.client)}</h2>
        <p>${esc(draft.title)}<br><span class="muted">${esc(draft.site || draft.clientAddress)}</span></p>
        <button id="editQuoteClient" class="text-button">Modifier le client / chantier</button></section>
        <form id="quoteForm"><section class="card"><h2>Main-d’œuvre et conditions</h2>
            <button type="button" id="addReviewLine" class="secondary">+ Main-d’œuvre / prestation</button>
            <button type="button" id="reviewSelection" class="text-button">Vérifier les lignes et les pièces</button>
            <div class="grid conditions-fields">${field("date", "Date du devis", draft.date, "date", "required")}
                ${field("validity", "Validité (jours)", draft.validity, "number", 'min="1" max="365" required')}
                ${field("discount", "Remise globale (%)", draft.discount, "number", 'min="0" max="100" step="0.1" required')}
                ${select(
                  "mode",
                  "Tarification",
                  [
                    ["hourly", "Matériel + heures"],
                    ["package", "Forfaits"],
                    ["mixed", "Mixte"],
                  ],
                  draft.mode,
                )}
            </div>${area("terms", "Conditions de paiement et d’exécution", draft.terms)}
            <details><summary>Autres mentions et suivi</summary>${area("vatNote", "Mention TVA", draft.vatNote)}
                ${area("notes", "Précisions et exclusions", draft.notes)}
                </details>
        </section><section id="summary" class="card total"></section><div class="actions">
            <button type="button" id="previousStage" class="secondary">← Client et chantier</button>
            <button type="submit" class="secondary">Enregistrer</button><button type="button" id="pdf">Générer le PDF</button></div></form>`;
  $("editQuoteClient").onclick = () => changeQuoteStage(1);
  $("previousStage").onclick = () => changeQuoteStage(1);
  $("reviewSelection").onclick = showQuoteSelection;
  $("addReviewLine").onclick = () => {
    capture();
    openLabor();
  };
  const orderButton = document.createElement("button");
  orderButton.type = "button";
  orderButton.id = "purchaseList";
  orderButton.className = "secondary";
  orderButton.textContent = "Matériel à commander";
  orderButton.onclick = () => openPurchaseList(draft);
  $("reviewSelection").after(orderButton);
  mountQuotePricing();
  mountQuoteChecks();
  mountProfitPanel();
  addDurationChoices();
  addPaymentChoices();
  function summary() {
    const total = totals(draft);
    $("summary").innerHTML =
      `<div class="row"><span>${draft.lines.length} lignes · Total HT</span><strong>${money(total.ht)}</strong></div>
            <div class="row"><span>TVA</span><span>${money(total.tax)}</span></div>
            <div class="row"><span>Total TTC</span><strong class="money">${money(total.ttc)}</strong></div>`;
  }
  summary();
  $("quoteForm").onchange = () => {
    capture();
    summary();
    refreshQuoteChecks();
  };
  $("f-discount").oninput = () => {
    capture();
    summary();
  };
  $("quoteForm").onsubmit = (event) => {
    event.preventDefault();
    capture();
    storeQuote();
  };
  $("quoteForm").addEventListener(
    "invalid",
    (event) => {
      let details = event.target.closest("details");
      while (details) {
        details.open = true;
        details = details.parentElement.closest("details");
      }
    },
    true,
  );
  $("pdf").onclick = requestQuotePdf;
}
