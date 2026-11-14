"use strict";

const RECOVERY_INTERVAL = 10 * 60 * 1000;
const RECOVERY_LIMIT = 5;
let recoveryDatabase = null;
let checkpointQueue = Promise.resolve();
let recoveryError = "";

function openRecoveryDatabase() {
  if (recoveryDatabase) return recoveryDatabase;
  recoveryDatabase = new Promise((resolve, reject) => {
    const request = indexedDB.open("deviselec-recovery", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("checkpoints", { keyPath: "id" });
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Stockage de secours occupé"));
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        recoveryDatabase = null;
      };
      resolve(request.result);
    };
  }).catch((error) => {
    recoveryDatabase = null;
    throw error;
  });
  return recoveryDatabase;
}

async function recoverySnapshots() {
  const database = await openRecoveryDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction("checkpoints")
      .objectStore("checkpoints")
      .getAll();
    request.onsuccess = () =>
      resolve(
        request.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    request.onerror = () => reject(request.error);
  });
}

function queueRecoveryCheckpoint(previous, current, options = {}) {
  if (!previous || previous === current) return;
  checkpointQueue = checkpointQueue
    .then(async () => {
      const before = JSON.parse(previous),
        after = JSON.parse(current);
      const deletion = [
        "companies",
        "quotes",
        "clients",
        "catalog",
        "workKits",
        "laborPresets",
      ].some((key) => (before[key]?.length || 0) > (after[key]?.length || 0));
      const force = options.forceCheckpoint || deletion;
      const database = await openRecoveryDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction("checkpoints", "readwrite");
        const store = transaction.objectStore("checkpoints");
        const request = store.getAll();
        request.onsuccess = () => {
          const snapshots = request.result.sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          );
          const latest = snapshots[0];
          if (
            latest?.payload === previous ||
            (!force &&
              latest &&
              Date.now() - Date.parse(latest.createdAt) < RECOVERY_INTERVAL)
          )
            return;
          store.put({
            id: uid(),
            createdAt: new Date().toISOString(),
            reason:
              options.checkpointReason ||
              (deletion ? "Avant suppression" : "Sauvegarde automatique"),
            payload: previous,
          });
          snapshots
            .slice(RECOVERY_LIMIT - 1)
            .forEach((snapshot) => store.delete(snapshot.id));
        };
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () =>
          reject(transaction.error || new Error("Sauvegarde interrompue"));
      });
      recoveryError = "";
    })
    .catch(() => {
      const message =
        "Les sauvegardes de secours sont indisponibles. Exportez une sauvegarde dans un fichier.";
      if (!recoveryError) toast(message);
      recoveryError = message;
    })
    .then(() => {
      if ($("recoveryPanel")) renderRecoveryPanel();
    });
}

function exportTextFile(content, filename, mime) {
  if (window.Android && typeof Android.exportText === "function") {
    Android.exportText(content, filename, mime);
  } else if (
    mime === "application/json" &&
    window.Android &&
    typeof Android.backup === "function"
  ) {
    Android.backup(content);
  } else {
    const url = URL.createObjectURL(
      new Blob([content], { type: mime + ";charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function mountRecoveryPanel() {
  const section = document.createElement("section");
  section.id = "recoveryPanel";
  section.className = "card";
  $("main").append(section);
  renderRecoveryPanel();
}

async function renderRecoveryPanel() {
  const section = $("recoveryPanel");
  if (!section) return;
  try {
    const snapshots = await recoverySnapshots();
    if (!section.isConnected) return;
    section.innerHTML = `<h2>Sauvegardes de secours</h2><p class="muted">Jusqu’à cinq versions précédentes sur cet appareil, espacées de dix minutes. Une copie est aussi conservée avant une suppression, une restauration ou un verrouillage.</p>
      ${recoveryError ? `<p class="notice">${esc(recoveryError)}</p>` : ""}
      <p class="muted">Exportez un fichier pour conserver une copie hors de cet appareil.</p>
      ${snapshots.map((snapshot, index) => `<article class="line"><strong>${new Date(snapshot.createdAt).toLocaleString("fr-FR")}</strong><p class="muted">${esc(snapshot.reason)}</p><div class="actions"><button class="secondary" data-recover="${index}">Restaurer cette version</button><button class="text-button" data-export-recovery="${index}">Exporter</button></div></article>`).join("") || '<p class="muted">La première sauvegarde de secours sera créée lors du prochain enregistrement.</p>'}`;
    section.querySelectorAll("[data-recover]").forEach((button) => {
      button.onclick = () =>
        restoreData(snapshots[Number(button.dataset.recover)].payload);
    });
    section.querySelectorAll("[data-export-recovery]").forEach((button) => {
      button.onclick = () =>
        exportTextFile(
          snapshots[Number(button.dataset.exportRecovery)].payload,
          "deviselec-secours.json",
          "application/json",
        );
    });
  } catch (error) {
    if (section.isConnected)
      section.innerHTML =
        '<h2>Sauvegardes de secours</h2><p class="notice">Le stockage de secours est indisponible. Utilisez l’export de sauvegarde dans un fichier.</p>';
  }
}
