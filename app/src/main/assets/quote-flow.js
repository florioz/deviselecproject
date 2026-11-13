"use strict";

function renderEditor() {
  document.body.dataset.quoteMode = "true";
  const stage = Math.max(0, Math.min(2, Number(draft.stage) || 0));
  draft.stage = stage;
  $("main").innerHTML =
    `<div class="row"><div><p class="muted">${esc(draft.number)}</p><h1>Mon devis</h1></div>
        <button id="back" class="secondary">Fermer</button></div>
        <div class="quote-steps" aria-label="Étapes du devis">
            ${["Matériel", "Client et chantier", "Conditions et PDF"]
              .map(
                (label, index) =>
                  `<button type="button" data-stage="${index}" aria-current="${index === stage ? "step" : "false"}">${label}</button>`,
              )
              .join("")}
        </div><div id="quoteStage"></div>`;
  $("back").onclick = () => {
    capture();
    storeQuote(true);
    draft = null;
    renderQuotes();
  };
  document.querySelectorAll("[data-stage]").forEach((button) => {
    button.onclick = () => changeQuoteStage(Number(button.dataset.stage));
  });
  if (stage === 0) renderMaterialStage();
  else if (stage === 1) renderClientStage();
  else renderQuoteReview();
}

function changeQuoteStage(stage) {
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

function storeQuote(quiet = false) {
  if (!draft) return false;
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
  if (!save()) {
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
        <button id="addLine" class="text-button">+ Ligne libre</button></div>
        <section class="card" id="catalogBrowser"></section>
        <div class="selection-bar"><button id="selectionButton" class="secondary"></button>
            <div><small>Total TTC</small><strong id="selectionTotal"></strong></div>
            <button id="nextStage">Client et chantier →</button></div>`;
  $("addLine").onclick = () => lineModal();
  $("selectionButton").onclick = showQuoteSelection;
  $("nextStage").onclick = () => changeQuoteStage(1);
  mountCatalogBrowser($("catalogBrowser"), true);
  refreshSelectionSummary();
}

function refreshSelectionSummary() {
  if (!$("selectionButton") || !draft) return;
  $("selectionButton").closest(".selection-bar").hidden =
    draft.lines.length === 0;
  $("selectionButton").textContent = `Ma sélection (${draft.lines.length})`;
  $("selectionTotal").textContent = money(totals(draft).ttc);
}

function quoteProductLine(product) {
  return draft?.lines.find(
    (line) =>
      line.catalogId === productKey(product) &&
      line.unit === (product.unit || "u"),
  );
}

function quoteProductPrice(product) {
  const existing = quoteProductLine(product);
  if (existing) return existing.price;
  if (product.kind !== "material") return product.price ?? null;
  return product.cost == null
    ? null
    : round(product.cost * (1 + company().markup / 100));
}

function quickAddProduct(product, delta = 1) {
  const existing = quoteProductLine(product);
  if (existing) {
    existing.qty = round(existing.qty + delta);
    if (existing.qty <= 0) draft.lines.splice(draft.lines.indexOf(existing), 1);
  } else if (delta > 0) {
    if (product.kind === "material" && product.cost == null) {
      lineModal(undefined, {
        ...product,
        catalogId: productKey(product),
        qty: 1,
        price: 0,
        markup: company().markup,
        vat: company().vat,
      });
      return;
    }
    draft.lines.push({
      ...product,
      catalogId: productKey(product),
      qty: 1,
      price: quoteProductPrice(product),
      markup: company().markup,
      vat: company().vat,
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
          `<article class="selected-line"><div>${equipmentPhoto(line)}<strong>${esc(line.label)}</strong></div>
            <div class="row"><span>${money(line.price)} HT / ${esc(line.unit)}</span>
                <div class="inline-quantity"><button class="secondary" data-line-delta="-1" data-index="${index}" aria-label="Diminuer ${esc(line.label)}">−</button>
                    <strong>${line.qty}</strong><button class="secondary" data-line-delta="1" data-index="${index}" aria-label="Augmenter ${esc(line.label)}">+</button></div></div>
            <button class="text-button" data-edit-line="${index}">Détails / prix / supprimer</button></article>`,
      )
      .join("") || '<p class="empty">Votre sélection est vide.</p>'
  }</div>
        <div class="actions"><button id="closeSelection" class="secondary">Continuer le matériel</button>
            <button id="selectionNext">Client et chantier →</button></div>`);
  wireEquipmentPhotos($("dialog"));
  $("closeSelection").onclick = closeModal;
  $("selectionNext").onclick = () => {
    closeModal();
    changeQuoteStage(1);
  };
  $("dialog")
    .querySelectorAll("[data-line-delta]")
    .forEach((button) => {
      button.onclick = () => {
        const index = Number(button.dataset.index);
        draft.lines[index].qty = round(
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
                ${select(
                  "status",
                  "Suivi",
                  [
                    ["Brouillon", "Brouillon"],
                    ["Envoyé", "Envoyé"],
                    ["Accepté", "Accepté"],
                    ["Refusé", "Refusé"],
                  ],
                  draft.status,
                )}</details>
        </section><section id="summary" class="card total"></section><div class="actions">
            <button type="button" id="previousStage" class="secondary">← Client et chantier</button>
            <button type="submit" class="secondary">Enregistrer</button><button type="button" id="pdf">Générer le PDF</button></div></form>`;
  $("editQuoteClient").onclick = () => changeQuoteStage(1);
  $("previousStage").onclick = () => changeQuoteStage(1);
  $("addReviewLine").onclick = () => {
    capture();
    lineModal(undefined, {
      kind: "labor",
      label: "Pose et raccordement",
      qty: 1,
      unit: "h",
      cost: 0,
      markup: 0,
      price: company().rate,
      vat: company().vat,
      ref: "",
      url: "",
      checked: "",
    });
  };
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
  $("pdf").onclick = () => {
    if (!$("quoteForm").reportValidity()) return;
    capture();
    if (!draft.lines.length || !draft.client || !draft.clientAddress) {
      changeQuoteStage(1);
      return;
    }
    if (storeQuote(true)) printQuote(draft);
  };
}
