# Deviselec pour Android

Application Android 8 et versions suivantes. Fonctionne hors connexion, sans compte distant.

## Installer

### Aperçu sur ordinateur

Sous Windows, double-cliquer sur `Ouvrir-Deviselec.cmd` pour ouvrir l’application dans le navigateur. Le lanceur utilise Node.js, démarre un serveur local sur `http://127.0.0.1:8765` et réutilise le serveur aux ouvertures suivantes. Le serveur lit directement les fichiers du projet. Les données de cet aperçu sont enregistrées dans le navigateur.

Le sélecteur de logo et l’aperçu des devis sont accessibles dans le navigateur. L’actualisation native du catalogue et les sélecteurs Android se vérifient avec l’APK. Pour démarrer le serveur dans un terminal, utiliser `npm run preview`.

### Application Android

Le fichier `livraison/Deviselec-0.4.0-debug.apk` est une version de test signée avec la clé de développement Android. Le copier sur le téléphone, l’ouvrir et autoriser cette source d’installation lorsque Android le demande. Installer la mise à jour par-dessus la version précédente permet de conserver les données locales.

1. Créer un profil dans **Entreprise** : identité, adresse, logo, tarifs, TVA et conditions.
2. Dans **Clients**, enregistrer les coordonnées des clients de l’entreprise. Les clients des anciens devis sont repris automatiquement dans ce carnet.
3. Dans **Mes devis**, créer un devis. L’étape **Matériel** propose un arbre visuel de familles et d’équipements, puis les marques et budgets. **Ajouter** et les boutons **+ / −** remplissent directement la sélection. Les favoris et les références déjà utilisées sont proposés en premier. La recherche par référence ou mots reste disponible.
4. Continuer vers **Client et chantier**, sélectionner un client et préciser le chantier, puis **Conditions et PDF** pour la main-d’œuvre, les remises, les conditions et le document final. La création d’un client depuis ce parcours ouvre le carnet et ramène au devis en conservant le matériel. Le brouillon se sauvegarde pendant la sélection et aux changements d’étape. **Générer le PDF** ouvre le service d’impression Android pour choisir **Enregistrer au format PDF**.
5. Exporter régulièrement une sauvegarde depuis **Données**. Une désinstallation supprime les données locales.

## Périmètre

- Plusieurs profils d’entreprise locaux, catalogues et devis séparés.
- Matériel avec majoration du coût d’achat HT ; main-d’œuvre horaire ; prestations au forfait ; combinaison possible.
- Quantités, unités, remise globale et TVA par ligne. Les bases HT remisées sont arrondies par ligne au centime, puis la TVA par taux.
- Duplication, recherche, suivi manuel des devis et sauvegarde/restauration JSON.
- Choix de durée, modèles de paiement, reprise d’un client existant, suggestions d’objet et prestations rapides.
- Catalogue fournisseur partagé hors connexion et personnalisations propres à chaque entreprise.
- Carnet Clients par entreprise et parcours de devis en trois étapes, avec ajout direct et ajustement rapide des quantités.
- Filtres par famille, marque, type, favoris, bibliothèque, prix et disponibilité relevée. Tri et affichage progressif de 30 résultats.
- PDF A4 : identité de l’entreprise au moment de la création, logo, client, chantier, lignes, remises, ventilation TVA, conditions et espace de signature.

## 123elec

Le catalogue embarqué contient **6 506 fiches** issues du plan du site public de 123elec, relevées le **12 novembre 2026**. Les prix proviennent des offres EUR publiées dans les données structurées des pages de catégories et des fiches produit. Le fichier `app/src/main/assets/catalog-123elec.json` indique la couverture des prix, les pages consultées et les éventuels échecs de récupération.

La conversion des prix publics TTC en coûts d’achat HT utilise une TVA de **20 %**, avec arrondi au centime et frais de livraison exclus. Ces prix sont indicatifs et modifiables. Vérifier le conditionnement et le prix applicable sur la fiche fournisseur. Les références sans offre numérique exploitable demandent la saisie d’un prix d’achat avant leur ajout au devis.

Les familles sont attribuées automatiquement d’après les désignations. La personnalisation d’une référence permet de corriger la famille, la marque ou le coût pour l’entreprise active. Les favoris sont propres à l’entreprise. Chaque devis conserve le prix et les informations de la référence au moment de son ajout.

L’arbre de sélection classe les équipements d’après leurs familles et désignations. Les photos de 6 506 références sont indexées depuis le plan du site public de 123elec. **38 photos représentatives** sont embarquées pour naviguer hors connexion. Les autres photos sont téléchargées à la demande. Sur Android, elles sont mises en cache sur le téléphone dans une limite de 60 Mo. Une référence reste sélectionnable lorsque sa photo est indisponible. Les budgets de l’étape Matériel portent sur les prix de vente HT avec la majoration de l’entreprise. L’onglet Catalogue affiche les coûts d’achat HT.

Les recommandations proviennent des favoris et de l’historique local des devis de l’entreprise. Les anciens devis conservent leurs prix et leurs coordonnées. Modifier une fiche Client permet de préparer les futurs devis avec les nouvelles coordonnées.

Dans **Catalogue**, le bouton **Mettre à jour 123elec** récupère les références du plan du site, les prix par famille puis les fiches complémentaires. La progression et un bouton d’annulation sont affichés. Garder l’application ouverte pendant le téléchargement, de préférence en Wi-Fi. Le nouveau catalogue est enregistré dans un fichier local à la fin d’une actualisation exploitable. Une annulation ou un échec de connexion laisse le catalogue précédent disponible. Les pages individuellement indisponibles conservent leurs anciens prix et dates et sont signalées dans le bilan.

Les actualisations conservent les favoris, les personnalisations d’entreprise et les prix déjà enregistrés dans les devis. Le catalogue téléchargé se recharge au lancement et reste consultable hors connexion.

L’ouverture de **Fiche 123elec** utilise le navigateur du téléphone. Les personnalisations, favoris et devis sont conservés dans la sauvegarde JSON. La base fournisseur téléchargée est stockée séparément sur le téléphone et peut être récupérée avec le bouton d’actualisation après une réinstallation.

## Logo

Le champ **Logo** ouvre le sélecteur d’images Android pour choisir un PNG, JPEG ou WebP. L’application affiche un aperçu et redimensionne automatiquement l’image à un maximum de 900 pixels, puis la réduit davantage si nécessaire pour son stockage. La transparence des logos PNG et WebP est conservée. Enregistrer le formulaire **Entreprise** pour conserver le logo. Les fichiers jusqu’à 20 Mo sont acceptés pour le traitement.

Sources publiques utilisées pour le relevé

- https://www.123elec.com/media/sitemap/sitemap.xml
- https://www.123elec.com/gamme-materiel-electrique.html
- Les autres catégories et fiches produit dont les liens sont conservés dans le catalogue.

## Limites à connaître

Cette version constitue une base fonctionnelle à tester sur un téléphone réel. Les profils locaux ne sont pas des comptes utilisateurs isolés par authentification. Pas de synchronisation multi-appareils, de signature électronique, de facturation ni de calcul automatique de conformité électrique.

Les tarifs horaires et conditions proposés sont des valeurs initiales à adapter. Renseigner et vérifier les mentions correspondant à l’entreprise, à son assurance, au client et au chantier avant d’envoyer un devis réel. Le statut « Accepté » est une indication manuelle et ne constitue pas une signature.

La version debug convient aux essais. Avant un usage durable, prévoir une clé de signature de distribution conservée en sécurité et un mécanisme de migration des données. Les sauvegardes JSON contiennent les données clients en clair : les conserver dans un emplacement privé.

## Développement et vérification

Coque Android Java et interface HTML/CSS/JavaScript embarquée dans WebView. L’actualisation utilise HTTPS vers `www.123elec.com`, avec deux téléchargements simultanés et une écriture atomique de la base. La permission Internet est utilisée pour cette fonctionnalité. Impression par le service Android et export/import avec le sélecteur de documents système. Aucun serveur nécessaire.

Java 17 ou 21 et SDK Android 36 requis. Définir `ANDROID_HOME` ou `sdk.dir` dans `local.properties`, puis :

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:lintDebug
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

Pour reconstruire l’index des photos et les visuels représentatifs, utiliser `py tools/prepare_catalog_images.py`.
