# Deviselec — première version Android

Application Android 8 et versions suivantes. Fonctionne hors connexion, sans compte distant.

## Installer

Le fichier `livraison/Deviselec-0.1.0-debug.apk` est une version de test signée avec la clé de développement Android. Le copier sur le téléphone, l’ouvrir et autoriser cette source d’installation lorsque Android le demande.

1. Créer un profil dans **Entreprise** : identité, adresse, logo, tarifs, TVA et conditions.
2. Dans **Catalogue**, ajouter les fournitures et prestations habituelles ou importer les trois références 123elec de démarrage.
3. Dans **Mes devis**, créer un devis, choisir le mode horaire, forfaitaire ou mixte, puis ajouter les lignes.
4. **Enregistrer** conserve le devis sur ce téléphone. **Générer le PDF** ouvre le service d’impression Android : choisir **Enregistrer au format PDF**, puis le dossier de destination. Le fichier peut ensuite être partagé depuis le gestionnaire de fichiers.
5. Exporter régulièrement une sauvegarde depuis **Données**. Une désinstallation supprime les données locales.

## Périmètre

- Plusieurs profils d’entreprise locaux, catalogues et devis séparés.
- Matériel avec majoration du coût d’achat HT ; main-d’œuvre horaire ; prestations au forfait ; combinaison possible.
- Quantités, unités, remise globale et TVA par ligne. Les bases HT remisées sont arrondies par ligne au centime, puis la TVA par taux.
- Duplication, recherche, suivi manuel des devis et sauvegarde/restauration JSON.
- PDF A4 : identité de l’entreprise au moment de la création, logo, client, chantier, lignes, remises, ventilation TVA, conditions et espace de signature.

## 123elec

Pas d’API ni de synchronisation automatique dans cette version. Le bouton d’import ajoute trois références et des prix publics relevés le **12 novembre 2026** : 600335 (2,99 € TTC), 600801 (1,10 € TTC), 600001 (3,35 € TTC). Conversion HT indicative à 20 %, arrondie au centime. Les prix sont modifiables et ne comprennent pas les frais de livraison. Source et date restent dans le catalogue et les lignes du devis ; les coûts d’achat et majorations ne sont pas imprimés sur le PDF client.

Source : https://www.123elec.com/legrand-dooxie-prise-de-courant-2p-t-surface-blanc-600335.html (fiche et produits complémentaires).

## Limites à connaître

Cette version constitue une base fonctionnelle à tester sur un téléphone réel. Les profils locaux ne sont pas des comptes utilisateurs isolés par authentification. Pas de synchronisation multi-appareils, de signature électronique, de facturation ni de calcul automatique de conformité électrique.

Les tarifs horaires et conditions proposés sont des valeurs initiales à adapter. Renseigner et vérifier les mentions correspondant à l’entreprise, à son assurance, au client et au chantier avant d’envoyer un devis réel. Le statut « Accepté » est une indication manuelle et ne constitue pas une signature.

La version debug convient aux essais. Avant un usage durable, prévoir une clé de signature de distribution conservée en sécurité et un mécanisme de migration des données. Les sauvegardes JSON contiennent les données clients en clair : les conserver dans un emplacement privé.

## Développement et vérification

Coque Android Java et interface HTML/CSS/JavaScript embarquée dans WebView, sans bibliothèque réseau et sans permission Internet. Impression par le service Android et export/import avec le sélecteur de documents système. Aucun serveur nécessaire.

Java 17 ou 21 et SDK Android 36 requis. Définir `ANDROID_HOME` ou `sdk.dir` dans `local.properties`, puis :

```powershell
.\gradlew.bat :app:assembleDebug :app:lintDebug
```

Tests fonctionnels dans Chromium (Google Chrome installé au chemin Windows standard) :

```powershell
npm install
npm test
```

Le scénario vérifie création, prix de vente, remise, TVA mixte, sauvegarde après rechargement et isolation entre entreprises. Il produit aussi une capture mobile et un exemple de PDF dans `tmp/`. Ces vérifications ne remplacent pas les essais du service PDF Android sur appareil réel.
