# Deviselec pour Android

Application Android 8 et versions suivantes. Fonctionne hors connexion, sans compte distant.

## Installer

Le fichier `livraison/Deviselec-0.2.0-debug.apk` est une version de test signée avec la clé de développement Android. Le copier sur le téléphone, l’ouvrir et autoriser cette source d’installation lorsque Android le demande. Installer la mise à jour par-dessus la version précédente permet de conserver les données locales.

1. Créer un profil dans **Entreprise** : identité, adresse, logo, tarifs, TVA et conditions.
2. Dans **Catalogue**, rechercher une référence 123elec par mots, référence ou EAN. Choisir une famille et une marque, enregistrer ses favoris ou personnaliser ses prix.
3. Dans **Mes devis**, créer un devis, choisir le mode horaire, forfaitaire ou mixte, puis ajouter les lignes.
4. **Enregistrer** conserve le devis sur ce téléphone. **Générer le PDF** ouvre le service d’impression Android : choisir **Enregistrer au format PDF**, puis le dossier de destination. Le fichier peut ensuite être partagé depuis le gestionnaire de fichiers.
5. Exporter régulièrement une sauvegarde depuis **Données**. Une désinstallation supprime les données locales.

## Périmètre

- Plusieurs profils d’entreprise locaux, catalogues et devis séparés.
- Matériel avec majoration du coût d’achat HT ; main-d’œuvre horaire ; prestations au forfait ; combinaison possible.
- Quantités, unités, remise globale et TVA par ligne. Les bases HT remisées sont arrondies par ligne au centime, puis la TVA par taux.
- Duplication, recherche, suivi manuel des devis et sauvegarde/restauration JSON.
- Choix de durée, modèles de paiement, reprise d’un client existant, suggestions d’objet et prestations rapides.
- Catalogue fournisseur partagé hors connexion et personnalisations propres à chaque entreprise.
- Filtres par famille, marque, type, favoris, bibliothèque, prix et disponibilité relevée. Tri et affichage progressif de 30 résultats.
- PDF A4 : identité de l’entreprise au moment de la création, logo, client, chantier, lignes, remises, ventilation TVA, conditions et espace de signature.

## 123elec

Le catalogue embarqué contient **6 506 fiches** issues du plan du site public de 123elec, relevées le **12 novembre 2026**. Les prix proviennent des offres EUR publiées dans les données structurées des pages de catégories et des fiches produit. Le fichier `app/src/main/assets/catalog-123elec.json` indique la couverture des prix, les pages consultées et les éventuels échecs de récupération.

La conversion des prix publics TTC en coûts d’achat HT utilise une TVA de **20 %**, avec arrondi au centime et frais de livraison exclus. Ces prix sont indicatifs et modifiables. Vérifier le conditionnement et le prix applicable sur la fiche fournisseur. Les références sans offre numérique exploitable demandent la saisie d’un prix d’achat avant leur ajout au devis.

Les familles sont attribuées automatiquement d’après les désignations. La personnalisation d’une référence permet de corriger la famille, la marque ou le coût pour l’entreprise active. Les favoris sont propres à l’entreprise. Chaque devis conserve le prix et les informations de la référence au moment de son ajout.

L’ouverture de **Fiche 123elec** utilise le navigateur du téléphone. Le catalogue de l’application est un relevé embarqué daté. Les personnalisations, favoris et devis sont conservés dans la sauvegarde JSON. Le catalogue commun est livré avec l’application.

Sources publiques utilisées pour le relevé

- https://www.123elec.com/media/sitemap/sitemap.xml
- https://www.123elec.com/gamme-materiel-electrique.html
- Les autres catégories et fiches produit dont les liens sont conservés dans le catalogue.

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

Les tests vérifient aussi les favoris, les filtres combinés, le tri des prix, la recherche hors connexion, la reprise d’un client, les modèles de formulaire, la personnalisation par entreprise et la saisie obligatoire des prix manquants.

Pour reconstruire le relevé fournisseur avec Python et `beautifulsoup4`

```powershell
py tools/import_123elec.py
py tools/import_123elec.py --details
```

La récupération utilise deux connexions simultanées et un cache quotidien dans `tmp/123elec`. Les pages en échec sont consignées dans le catalogue.
