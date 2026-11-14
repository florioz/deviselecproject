"use strict";

function isQuoteLocked(quote) {
  return Boolean(
    quote?.locked || db.quotes.find((item) => item.id === quote?.id)?.locked,
  );
}

function quoteWarnings(quote) {
  const issues = [];
  if (!quote.lines.length)
    issues.push({
      blocking: true,
      message: "Le devis ne contient aucune ligne.",
    });
  if (!quote.client?.trim() || !quote.clientAddress?.trim())
    issues.push({
      blocking: true,
      message: "Choisissez un client avec une adresse complète.",
    });
  const maxAge = Number(quote.priceAgeDays) || 90;
  const now = new Date(today() + "T12:00:00").getTime();
  quote.lines.forEach((line, index) => {
    const prefix = `${index + 1}. ${line.label}`;
    if (line.needsPrice || !Number.isFinite(line.price) || line.price < 0) {
      issues.push({
        blocking: true,
        index,
        message: `${prefix} — prix à compléter.`,
      });
    } else if (line.price === 0) {
      issues.push({
        blocking: false,
        index,
        message: `${prefix} — prix de vente à zéro.`,
      });
    }
    if (line.kind !== "material") return;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(line.checked || "")
      ? Date.parse(line.checked + "T12:00:00")
      : NaN;
    if (!Number.isFinite(date) || date > now) {
      issues.push({
        blocking: false,
        index,
        message: `${prefix} — date de vérification du prix à renseigner.`,
      });
    } else if (now - date > maxAge * 86400000) {
      issues.push({
        blocking: false,
        index,
        message: `${prefix} — prix vérifié le ${line.checked.split("-").reverse().join("/")}, il y a plus de ${maxAge} jours.`,
      });
    }
  });
  return issues;
}

function warningList(issues) {
  return `<ul class="quote-warning-list">${issues.map((issue) => `<li>${esc(issue.message)}</li>`).join("")}</ul>`;
}

function mountQuoteChecks() {
  const section = document.createElement("section");
  section.className = "card";
  section.innerHTML = `<details id="quoteChecks"><summary>Vérifications avant finalisation <span id="quoteCheckCount"></span></summary>
    ${select(
      "priceAgeDays",
      "Signaler un prix vérifié il y a plus de",
      [
        [30, "30 jours"],
        [60, "60 jours"],
        [90, "90 jours"],
        [180, "180 jours"],
      ],
      draft.priceAgeDays || 90,
    )}
    <div id="quoteCheckResults" role="status"></div></details>`;
  $("summary").before(section);
  $("f-priceAgeDays").onchange = () => {
    draft.priceAgeDays = Number($("f-priceAgeDays").value);
    refreshQuoteChecks();
  };
  refreshQuoteChecks();
}

function refreshQuoteChecks() {
  if (!$("quoteCheckResults")) return;
  const issues = quoteWarnings(draft);
  $("quoteCheckCount").textContent = issues.length
    ? `· ${issues.length} point(s) à vérifier`
    : "· Tout est renseigné";
  $("quoteCheckResults").innerHTML = issues.length
    ? warningList(issues)
    : '<p class="muted">Les coordonnées et les prix sont renseignés, les prix vérifiés sont récents.</p>';
}

function requestQuotePdf() {
  capture();
  const issues = quoteWarnings(draft);
  const blocking = issues.filter((issue) => issue.blocking);
  if (blocking.length) {
    if ($("quotePricing")) $("quotePricing").open = true;
    if ($("quoteChecks")) $("quoteChecks").open = true;
    refreshQuoteChecks();
    toast(blocking[0].message);
    return;
  }
  if (!$("quoteForm").reportValidity() || !storeQuote(true)) return;
  if (!issues.length) return printQuote(draft);
  modal(
    `<h2>Vérifier avant le PDF</h2>${warningList(issues)}<div class="actions"><button id="confirmQuotePdf">Générer avec ces valeurs</button><button class="secondary" onclick="closeModal()">Revenir au devis</button></div>`,
  );
  $("confirmQuotePdf").onclick = () => {
    closeModal();
    printQuote(draft);
  };
}

function openQuoteStatusDialog() {
  if (isQuoteLocked(draft)) return;
  capture();
  modal(`<h2>Modifier le statut du devis</h2><p>${esc(draft.number)} · ${esc(draft.client)}</p><form id="quoteStatusForm">
    ${select(
      "nextQuoteStatus",
      "Nouveau statut",
      QUOTE_STATUSES.map((status) => [status, status]),
      draft.status || "Brouillon",
    )}
    <div id="acceptQuoteOptions" hidden><label class="check-label"><input id="lockAcceptedQuote" type="checkbox" checked> Verrouiller ce devis accepté</label><p class="muted">Les modifications se feront dans une nouvelle version, avec un nouveau numéro.</p><div id="acceptQuoteWarnings"></div></div>
    <div class="actions"><button type="submit">Confirmer le changement</button><button type="button" class="secondary" onclick="closeModal()">Annuler</button></div></form>`);
  const updateOptions = () => {
    $("acceptQuoteOptions").hidden = $("f-nextQuoteStatus").value !== "Accepté";
    $("acceptQuoteWarnings").innerHTML = warningList(quoteWarnings(draft));
  };
  $("f-nextQuoteStatus").onchange = updateOptions;
  updateOptions();
  $("quoteStatusForm").onsubmit = (event) => {
    event.preventDefault();
    const status = $("f-nextQuoteStatus").value;
    if (status === "Accepté") {
      const blocking = quoteWarnings(draft).find((issue) => issue.blocking);
      if (blocking) return toast(blocking.message);
    }
    const previous = structuredClone(draft);
    draft.status = status;
    if (status === "Accepté" && $("lockAcceptedQuote").checked) {
      draft.locked = true;
      draft.lockedAt = new Date().toISOString();
    }
    if (
      !storeQuote(true, {
        forceCheckpoint: Boolean(draft.locked),
        checkpointReason: "Avant verrouillage du devis",
      })
    ) {
      draft = previous;
      return;
    }
    closeModal();
    renderEditor();
  };
}

function renderLockedQuote() {
  draft = structuredClone(
    db.quotes.find((quote) => quote.id === draft.id) || draft,
  );
  $("main").innerHTML =
    `<div class="row wrap"><div><p class="muted">${esc(draft.number)} · Version ${draft.revision || 1}</p><h1>Devis accepté</h1></div><button id="back" class="secondary">Fermer</button></div>
    <section class="card"><span class="pill">Verrouillé</span><h2>${esc(draft.client)}</h2><p>${esc(draft.title)}</p><p class="muted">${esc(draft.site || draft.clientAddress)}</p>
    <div class="actions"><button id="newQuoteRevision">Créer une nouvelle version</button><button id="lockedPdf" class="secondary">Générer le PDF</button><button id="lockedOrder" class="secondary">Matériel à commander</button></div></section>
    <section class="card"><h2>Contenu du devis</h2>${orderedQuoteLines(draft)
      .map(
        (line) =>
          `<article class="line"><strong>${esc(line.label)}</strong><p class="muted">${esc(line.room || "Ensemble du chantier")} · ${line.ref ? "Réf. " + esc(line.ref) + " · " : ""}${line.qty} ${esc(line.unit)} × ${money(line.price)} HT</p></article>`,
      )
      .join("")}<p class="money">${money(totals(draft).ttc)} TTC</p></section>
    <section class="card"><details><summary>Rentabilité estimée</summary>${profitSummaryHtml(draft)}</details></section>`;
  $("back").onclick = () => {
    draft = null;
    renderQuotes();
  };
  $("lockedPdf").onclick = () => printQuote(draft);
  $("lockedOrder").onclick = () => openPurchaseList(draft);
  $("newQuoteRevision").onclick = () => duplicateQuoteDialog(draft, true);
  mountQuoteDeletion();
}
