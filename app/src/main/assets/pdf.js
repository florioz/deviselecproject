"use strict";

function pdfHtml(q) {
  const c = q.company,
    t = totals(q),
    date = new Date(q.date + "T12:00:00"),
    expiry = new Date(date);
  expiry.setDate(date.getDate() + num(q.validity));
  const br = (s) => esc(s).replace(/\n/g, "<br>");
  return `<!doctype html><html lang="fr"><meta charset="UTF-8"><title>${esc(q.number)}</title><style>@page{size:A4;margin:14mm}body{font:11px Arial,sans-serif;color:#233a46;line-height:1.5}h1{font-size:30px;letter-spacing:2px;color:#087f77;margin:0}h2{font-size:15px;margin:0 0 8px}p{margin:5px 0}.head{width:100%;border-bottom:3px solid #087f77;padding-bottom:16px}.head td{vertical-align:top}.head td:last-child{text-align:right}.logo{max-width:150px;max-height:65px;margin-bottom:8px}.boxes{width:100%;margin:20px 0}.boxes td{width:50%;vertical-align:top;padding:12px;background:#f2f6f7}.lines{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:15px}.lines th{background:#173846;color:white;text-align:left;padding:9px 6px;font-size:10px}.lines td{border-bottom:1px solid #dce5e9;padding:9px 6px;vertical-align:top;overflow-wrap:anywhere}.lines tr{break-inside:avoid}.room-heading td{background:#e4f2ef;color:#086b64;font-size:12px}.room-heading{break-after:avoid}.lines thead{display:table-header-group}.right{text-align:right}.totals{margin:18px 0 18px auto;width:48%;break-inside:avoid}.totals td{padding:5px}.grand{background:#173846;color:white;font-weight:bold;font-size:15px}.section{margin:18px 0;break-inside:avoid}.muted{color:#637984;font-size:10px}.sign{border:1px solid #cddadd;padding:12px;min-height:95px;break-inside:avoid}.footer{border-top:1px solid #cddadd;margin-top:20px;padding-top:9px;font-size:9px;color:#637984;overflow-wrap:anywhere}</style><body><table class="head"><tr><td>${c.logo ? `<img class="logo" src="${esc(c.logo)}"><br>` : ""}<h2>${esc(c.name)}</h2>${br(c.address)}<p>${[c.phone, c.email].filter(Boolean).map(esc).join(" &#183; ")}</p></td><td><h1>DEVIS</h1><strong>${esc(q.number)}</strong><p>Émis le ${date.toLocaleDateString("fr-FR")}</p><p>Valable jusqu’au ${expiry.toLocaleDateString("fr-FR")}</p></td></tr></table><table class="boxes"><tr><td><h2>Client</h2><strong>${esc(q.client)}</strong><br>${br(q.clientAddress)}<p>${esc(q.email)}</p></td><td><h2>Chantier</h2><strong>${esc(q.title)}</strong><p>${br(q.site || q.clientAddress)}</p></td></tr></table><table class="lines"><colgroup><col style="width:43%"><col style="width:10%"><col style="width:9%"><col style="width:14%"><col style="width:9%"><col style="width:15%"></colgroup><thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th>P.U. HT</th><th>TVA</th><th>Total HT</th></tr></thead><tbody>${orderedQuoteLines(
    q,
  )
    .map(
      (l, i, lines) =>
        `${(i === 0 || (lines[i - 1].room || "") !== (l.room || "")) && roomNames(q).length ? `<tr class="room-heading"><td colspan="6"><strong>${esc(l.room || "Ensemble du chantier")}</strong></td></tr>` : ""}<tr><td><strong>${esc(l.label)}</strong>${l.ref ? `<br><span class="muted">Réf. ${esc(l.ref)}</span>` : ""}</td><td>${l.qty}</td><td>${esc(l.unit)}</td><td>${money(l.price)}</td><td>${l.vat} %</td><td class="right">${money(round(l.qty * l.price))}</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table><table class="totals"><tr><td>Sous-total HT</td><td class="right">${money(t.base)}</td></tr>${q.discount ? `<tr><td>Remise ${q.discount} %</td><td class="right">− ${money(t.discount)}</td></tr>` : ""}<tr><td>Total HT</td><td class="right">${money(t.ht)}</td></tr>${Object.entries(
    t.groups,
  )
    .map(
      ([v, b]) =>
        `<tr><td>TVA ${v} % (base ${money(b)})</td><td class="right">${money(round((b * num(v)) / 100))}</td></tr>`,
    )
    .join(
      "",
    )}<tr class="grand"><td>Total TTC</td><td class="right">${money(t.ttc)}</td></tr></table>${q.vatNote ? `<p>${br(q.vatNote)}</p>` : ""}<div class="section"><h2>Paiement et exécution</h2>${br(q.terms)}</div>${q.notes ? `<div class="section"><h2>Précisions et exclusions</h2>${br(q.notes)}</div>` : ""}<div class="sign"><strong>Bon pour accord</strong><br>Date et lieu :<br>Nom et signature du client :</div><div class="footer"><strong>${esc(c.name)}</strong> ${esc(c.legal)}<br>${br(c.address)}<br>${c.siret ? "SIRET : " + esc(c.siret) : ""}${c.vatId ? " · TVA : " + esc(c.vatId) : ""}${c.insurance ? "<br>Assurance : " + br(c.insurance) : ""}</div></body></html>`;
}
function printQuote(q) {
  const html = pdfHtml(q);
  if (window.Android) Android.pdf(html, q.number);
  else {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.onload = () => w.print();
    }
  }
}
