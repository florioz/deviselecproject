'use strict';

function addSuggestions(input, values, id) {
    if (!input) return;
    const datalist = document.createElement('datalist');
    datalist.id = id;
    datalist.innerHTML = [...new Set(values.filter(Boolean))]
        .map(value => `<option value="${esc(value)}"></option>`).join('');
    input.setAttribute('list', id);
    input.parentElement.append(datalist);
}

function notifyField(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function addDurationChoices() {
    const input = $('f-validity');
    if (!input) return;
    const current = Number(input.value);
    const days = [...new Set([7, 15, 30, 60, 90, current])].filter(value => value > 0).sort((a, b) => a - b);
    const choice = document.createElement('select');
    choice.id = 'validityChoice';
    choice.innerHTML = days.map(value => `<option value="${value}">${value} jours</option>`).join('') +
        '<option value="custom">Autre durée…</option>';
    choice.value = String(current);
    input.before(choice);
    input.hidden = true;
    input.setAttribute('aria-label', 'Durée personnalisée en jours');
    input.parentElement.querySelector('label').htmlFor = choice.id;
    choice.onchange = () => {
        input.hidden = choice.value !== 'custom';
        if (choice.value === 'custom') { input.focus(); return; }
        input.value = choice.value;
        notifyField(input);
    };
}

function addPaymentChoices() {
    const input = $('f-terms');
    if (!input) return;
    const choice = document.createElement('select');
    choice.id = 'paymentChoice';
    choice.setAttribute('aria-label', 'Modèle de conditions de paiement');
    choice.innerHTML = `
        <option value="">Choisir un modèle de paiement…</option>
        <option value="30">Acompte de 30 %, solde à réception</option>
        <option value="40">Acompte de 40 %, solde à réception</option>
        <option value="50">Acompte de 50 %, solde à réception</option>
        <option value="receipt">Paiement à réception des travaux</option>
        <option value="custom">Conditions personnalisées</option>`;
    input.before(choice);
    choice.onchange = () => {
        if (!choice.value || choice.value === 'custom') { input.focus(); return; }
        input.value = choice.value === 'receipt' ?
            'Paiement à la réception des travaux. Planning à convenir avec le client.' :
            `Acompte de ${choice.value} % à la commande. Solde à la réception des travaux. Planning à convenir avec le client.`;
        notifyField(input);
    };
}

function attachCompanyHelpers() {
    addDurationChoices();
    addPaymentChoices();
    addSuggestions($('f-legal'), [
        'Entreprise individuelle', 'Micro-entreprise', 'EURL', 'SARL', 'SASU', 'SAS',
    ], 'legalForms');
    $('f-name').autocomplete = 'organization';
    $('f-address').autocomplete = 'street-address';
    $('f-email').autocomplete = 'email';
    $('f-phone').autocomplete = 'tel';
}

function attachQuoteHelpers() {
    addDurationChoices();
    addPaymentChoices();
    const quotes = db.quotes.filter(quote => quote.companyId === db.active);
    const clients = new Map();
    quotes.forEach(quote => {
        const key = normalizeSearch(quote.client + ' ' + quote.clientAddress);
        clients.set(key, quote);
    });
    if (clients.size) {
        const previousClients = [...clients.values()].sort((a, b) => a.client.localeCompare(b.client, 'fr'));
        const block = document.createElement('div');
        block.className = 'field full';
        block.innerHTML = `<label for="previousClient">Reprendre un client enregistré</label>
            <select id="previousClient"><option value="">Nouveau client / saisie libre</option>
            ${previousClients.map((quote, index) => `<option value="${index}">${esc(quote.client)} · ${esc(quote.clientAddress.replace(/\n/g, ', '))}</option>`).join('')}
            </select>`;
        $('f-client').closest('.grid').prepend(block);
        $('previousClient').onchange = event => {
            if (event.target.value === '') return;
            const quote = previousClients[Number(event.target.value)];
            for (const field of ['client', 'clientAddress', 'email']) {
                $('f-' + field).value = quote[field] || '';
                notifyField($('f-' + field));
            }
        };
    }
    const subjects = [
        'Installation électrique neuve', 'Rénovation électrique', 'Mise en sécurité électrique',
        'Remplacement de tableau électrique', 'Ajout de prises et interrupteurs',
        'Installation d’éclairage', 'Dépannage électrique', 'Installation de VMC',
        'Installation de borne de recharge',
    ];
    addSuggestions($('f-title'), [...subjects, ...quotes.map(quote => quote.title)], 'quoteSubjects');
    addSuggestions($('f-client'), quotes.map(quote => quote.client), 'clientNames');
    const sameAddress = document.createElement('button');
    sameAddress.type = 'button';
    sameAddress.className = 'text-button';
    sameAddress.textContent = 'Utiliser l’adresse du client';
    sameAddress.onclick = () => {
        $('f-site').value = $('f-clientAddress').value.replace(/\n/g, ', ');
        notifyField($('f-site'));
    };
    $('f-site').after(sameAddress);
    $('f-client').autocomplete = 'name';
    $('f-clientAddress').autocomplete = 'street-address';
    $('f-email').autocomplete = 'email';
}

function attachLineHelpers(line) {
    const form = $('lineForm');
    const templates = [
        { label: 'Pose et raccordement', kind: 'labor', unit: 'h' },
        { label: 'Recherche de panne', kind: 'labor', unit: 'h' },
        { label: 'Pose d’une prise électrique', kind: 'service', unit: 'forfait' },
        { label: 'Pose d’un interrupteur', kind: 'service', unit: 'forfait' },
        { label: 'Pose d’un point lumineux', kind: 'service', unit: 'forfait' },
        { label: 'Remplacement d’un tableau électrique', kind: 'service', unit: 'forfait' },
        { label: 'Déplacement', kind: 'service', unit: 'forfait' },
        { label: 'Contrôle et essais de l’installation', kind: 'service', unit: 'forfait' },
    ];
    if (!line.catalogId && !line.sku) {
        const block = document.createElement('div');
        block.className = 'field full';
        block.innerHTML = `<label for="lineTemplate">Prestation rapide</label>
            <select id="lineTemplate"><option value="">Saisie libre</option>
            ${templates.map((template, index) => `<option value="${index}">${esc(template.label)}</option>`).join('')}</select>`;
        form.querySelector('.grid').prepend(block);
        $('lineTemplate').onchange = event => {
            if (event.target.value === '') return;
            const template = templates[Number(event.target.value)];
            $('f-label').value = template.label;
            $('f-kind').value = template.kind;
            $('f-kind').dispatchEvent(new Event('change'));
            $('f-unit').value = template.unit;
        };
    }

    const quantity = $('f-qty');
    const stepper = document.createElement('div');
    stepper.className = 'quantity-stepper';
    quantity.before(stepper);
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'secondary';
    minus.textContent = '−';
    minus.setAttribute('aria-label', 'Diminuer la quantité');
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'secondary';
    plus.textContent = '+';
    plus.setAttribute('aria-label', 'Augmenter la quantité');
    stepper.append(minus, quantity, plus);
    const changeQuantity = delta => {
        quantity.value = Math.min(1000000, Math.max(0.001, round(num(quantity.value) + delta)));
        notifyField(quantity);
    };
    minus.onclick = () => changeQuantity(-1);
    plus.onclick = () => changeQuantity(1);

    const details = document.createElement('details');
    details.className = 'full product-details';
    details.open = !line.catalogId;
    details.innerHTML = '<summary>Prix d’achat et informations produit</summary><div class="grid filter-grid"></div>';
    for (const name of ['cost', 'markup', 'ref', 'url', 'checked']) {
        details.querySelector('.grid').append($('f-' + name).closest('.field'));
    }
    form.querySelector('.grid').append(details);
    const unknownPrice = line.catalogId && line.cost == null;
    if (unknownPrice) {
        details.open = true;
        $('f-cost').value = '';
        $('f-cost').min = '0.01';
        $('f-price').min = '0.01';
        const message = document.createElement('p');
        message.className = 'notice';
        message.textContent = 'Saisissez le prix d’achat HT de cette référence pour calculer le prix de vente.';
        form.prepend(message);
    }
    $('f-cost').addEventListener('input', () => { $('f-checked').value = today(); });
    if (line.sourceTtc != null) {
        const source = document.createElement('p');
        source.className = 'muted';
        source.textContent = `Prix public relevé ${money(line.sourceTtc)} TTC. Achat HT calculé avec 20 % de TVA. Conditionnement indiqué dans la désignation.`;
        details.append(source);
    }
}
