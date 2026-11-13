"use strict";

let clientReturnQuote = null;

function initializeClients() {
  if (!Array.isArray(db.clients)) db.clients = [];
  let changed = false;
  for (const quote of db.quotes) {
    if (!quote.client?.trim()) continue;
    const exists = db.clients.some(
      (client) =>
        client.companyId === quote.companyId &&
        normalizeSearch(client.name) === normalizeSearch(quote.client) &&
        normalizeSearch(client.address) ===
          normalizeSearch(quote.clientAddress),
    );
    if (!exists) {
      db.clients.push({
        id: uid(),
        companyId: quote.companyId,
        type: "individual",
        name: quote.client,
        address: quote.clientAddress || "",
        email: quote.email || "",
        phone: "",
      });
      changed = true;
    }
  }
  if (changed) save();
}

function companyClients() {
  return db.clients
    .filter((client) => client.companyId === db.active)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

function searchClients(query, clients = companyClients()) {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  return clients.filter((client) => {
    const text = normalizeSearch(
      [client.name, client.address, client.email, client.phone].join(" "),
    );
    return words.every(
      (word) => text.includes(word) || text.replace(/ /g, "").includes(word),
    );
  });
}

function openClientPicker(selectedId, choose) {
  modal(`<h2>Choisir un client</h2><label for="clientPickerSearch">Nom, e-mail, téléphone ou ville</label>
    <input type="search" id="clientPickerSearch" autocomplete="off" placeholder="Rechercher dans le carnet…">
    <p id="clientPickerCount" class="muted" role="status" aria-live="polite"></p>
    <div id="clientPickerResults" class="client-picker-results"></div><div class="actions"><button id="morePickerClients" class="secondary">Afficher 30 clients de plus</button>
    <button type="button" class="secondary" id="cancelClientPicker">Annuler</button></div>`);
  let limit = 30;
  const clients = companyClients();
  const use = new Map();
  db.quotes
    .filter((quote) => quote.companyId === db.active && quote.clientId)
    .forEach((quote) =>
      use.set(quote.clientId, (use.get(quote.clientId) || 0) + 1),
    );
  function results() {
    const matches = searchClients($("clientPickerSearch").value, clients).sort(
      (a, b) =>
        Number(b.id === selectedId) - Number(a.id === selectedId) ||
        (use.get(b.id) || 0) - (use.get(a.id) || 0) ||
        a.name.localeCompare(b.name, "fr"),
    );
    $("clientPickerCount").textContent =
      `${matches.length} client(s) · ${Math.min(limit, matches.length)} affiché(s)`;
    $("clientPickerResults").innerHTML =
      matches
        .slice(0, limit)
        .map(
          (
            client,
          ) => `<button type="button" class="client-pick" data-choose-client="${esc(client.id)}" aria-pressed="${client.id === selectedId}">
      <strong>${esc(client.name)}</strong><span>${esc(client.address)}</span><small>${esc([client.email, client.phone].filter(Boolean).join(" · "))}</small></button>`,
        )
        .join("") ||
      '<p class="empty">Aucun client trouvé. Essayez un autre nom, une ville ou un téléphone.</p>';
    $("morePickerClients").hidden = matches.length <= limit;
    $("clientPickerResults")
      .querySelectorAll("[data-choose-client]")
      .forEach((button) => {
        button.onclick = () => {
          const client = clients.find(
            (item) => item.id === button.dataset.chooseClient,
          );
          closeModal();
          choose(client);
        };
      });
  }
  $("clientPickerSearch").oninput = () => {
    limit = 30;
    results();
  };
  $("morePickerClients").onclick = () => {
    limit += 30;
    results();
  };
  $("cancelClientPicker").onclick = closeModal;
  results();
  requestAnimationFrame(() => $("clientPickerSearch")?.focus());
}

function renderClients() {
  $("main").innerHTML =
    `<div class="row"><h1>Mes clients</h1><button id="newClient">+ Nouveau client</button></div>
        <section class="card"><label for="clientSearch">Rechercher un client</label>
            <input type="search" id="clientSearch" placeholder="Nom, e-mail, adresse…"><div id="clientList"></div></section>`;
  $("newClient").onclick = () => {
    if (!company()) {
      tab = "company";
      render();
      toast("Créez votre entreprise pour enregistrer vos clients");
      return;
    }
    renderClientForm();
  };
  function results() {
    const search = normalizeSearch($("clientSearch").value);
    $("clientList").innerHTML =
      companyClients()
        .filter((client) =>
          normalizeSearch(
            [client.name, client.address, client.email, client.phone].join(" "),
          ).includes(search),
        )
        .map(
          (
            client,
          ) => `<article class="line row wrap"><div><h3>${esc(client.name)}</h3>
                <p class="muted">${esc(client.address)}<br>${esc(client.email)} ${esc(client.phone)}</p></div>
                <button class="secondary" data-client="${esc(client.id)}">Modifier</button></article>`,
        )
        .join("") ||
      '<p class="empty">Enregistrez vos clients ici pour les retrouver dans vos devis.</p>';
    $("clientList")
      .querySelectorAll("[data-client]")
      .forEach((button) => {
        button.onclick = () => renderClientForm(button.dataset.client);
      });
  }
  $("clientSearch").oninput = results;
  results();
}

function renderClientForm(id) {
  const client = companyClients().find((item) => item.id === id) || {};
  $("main").innerHTML =
    `<h1>${client.id ? "Modifier le client" : "Nouveau client"}</h1>
        <form id="clientForm" class="card"><div class="grid">
            ${field("name", "Nom ou raison sociale *", client.name || "", "text", 'required autocomplete="name"')}
            ${select(
              "type",
              "Client",
              [
                ["individual", "Particulier"],
                ["business", "Professionnel"],
              ],
              client.type || "individual",
            )}
            ${area("address", "Adresse complète *", client.address || "")}
            ${field("email", "E-mail", client.email || "", "email", 'autocomplete="email"')}
            ${field("phone", "Téléphone", client.phone || "", "tel", 'autocomplete="tel"')}
        </div><div class="actions"><button type="submit">Enregistrer le client</button>
            <button type="button" id="cancelClient" class="secondary">Annuler</button></div></form>`;
  $("f-address").required = true;
  $("f-address").autocomplete = "street-address";
  $("cancelClient").onclick = () => finishClientForm();
  $("clientForm").onsubmit = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const next = { ...values, id: client.id || uid(), companyId: db.active };
    const previous = db.clients;
    db.clients = client.id
      ? previous.map((item) => (item.id === client.id ? next : item))
      : [...previous, next];
    if (!save()) {
      db.clients = previous;
      return;
    }
    finishClientForm(next);
    toast("Client enregistré");
  };
}

function finishClientForm(client) {
  if (!clientReturnQuote) {
    renderClients();
    return;
  }
  draft = clientReturnQuote;
  clientReturnQuote = null;
  tab = "quotes";
  draft.stage = 1;
  if (client) applyClientToQuote(client);
  render();
}

function createClientForQuote() {
  capture();
  storeQuote(true);
  clientReturnQuote = draft;
  draft = null;
  tab = "clients";
  render();
  renderClientForm();
}

function applyClientToQuote(client) {
  draft.clientId = client.id;
  draft.client = client.name;
  draft.clientAddress = client.address;
  draft.email = client.email;
  draft.clientPhone = client.phone;
}
