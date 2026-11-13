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
    setupLogoInput();
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

async function normalizeLogo(file) {
    if (file.size > 20 * 1024 * 1024) throw new Error('Choisissez une image de moins de 20 Mo.');
    if (file.type && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        throw new Error('Choisissez une image PNG, JPEG ou WebP.');
    }
    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error('Image illisible. Essayez un autre PNG, JPEG ou WebP.'));
            image.src = url;
        });
        let maximum = 900;
        const canvas = document.createElement('canvas');
        const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        while (maximum >= 100) {
            const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight));
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            const result = canvas.toDataURL(mime, 0.86);
            if (result.length <= 450000) return result;
            maximum = Math.floor(maximum * 0.75);
        }
        throw new Error('Cette image est trop complexe. Essayez un logo plus petit.');
    } finally {
        URL.revokeObjectURL(url);
    }
}

function setupLogoInput() {
    const form = $('companyForm');
    const input = $('logoInput');
    form.logoPromise = null;
    const preview = document.createElement('div');
    preview.id = 'logoPreview';
    preview.setAttribute('role', 'status');
    input.after(preview);
    input.onchange = () => {
        const file = input.files[0];
        if (!file) { form.logoPromise = null; preview.textContent = ''; return; }
        preview.textContent = 'Préparation du logo…';
        const remove = form.elements.removeLogo;
        if (remove) remove.checked = false;
        const task = normalizeLogo(file).then(data => {
            if (form.logoPromise === task) {
                preview.innerHTML = `<img src="${data}" alt="Aperçu du logo sélectionné" style="max-width:180px;max-height:90px;margin-top:12px"><p class="muted">Logo prêt. Enregistrez l’entreprise pour le conserver.</p>`;
            }
            return data;
        }).catch(error => {
            if (form.logoPromise === task) preview.textContent = error.message;
            return null;
        });
        form.logoPromise = task;
    };
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
