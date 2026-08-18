# Simple Cardiac Coherence

Une app de cohérence cardiaque minimaliste : un cercle bleu clair sur fond
sombre grandit à l'inspiration et se réduit à l'expiration, au rythme choisi.

- **Site** : (à renseigner une fois déployé sur Netlify)
- **Dépôt GitHub** : `vincent-bidaux/simple-cardiac-coherence`

Aucune étape de build : c'est du HTML/CSS/JS statique, servi tel quel.
Netlify déploie automatiquement à chaque push sur `main`, sans commande à
lancer.

## Déployer (depuis le téléphone, sans terminal)

1. Aller sur [app.netlify.com](https://app.netlify.com) et se connecter.
2. **Add new site → Import an existing project → Deploy with GitHub**.
3. Choisir le dépôt `simple-cardiac-coherence`.
4. Laisser les réglages de build vides (aucune commande, dossier de
   publication `.`) — déjà configuré dans `netlify.toml`.
5. Déployer. Chaque futur push sur `main` republie automatiquement.
6. Sur le téléphone, ouvrir l'URL Netlify dans Safari/Chrome puis
   **Partager → Sur l'écran d'accueil** pour l'installer comme une vraie
   app (PWA, plein écran, icône dédiée).

## Les 3 modes

Chaque mode combine un **rythme respiratoire** (respirations par minute) et
une **durée de séance**, choisis parmi les usages les plus recommandés en
cohérence cardiaque :

| Mode | Rythme | Durée | Pourquoi |
|---|---|---|---|
| **Standard 365** *(par défaut)* | 6 resp/min (5 s inspire / 5 s expire) | 5 min | La référence : méthode "3-6-5" du Dr David O'Hare — 3 séances/jour, 6 resp/min, 5 min. Le rythme le plus universellement recommandé (~0,1 Hz, la fréquence de résonance cardiovasculaire moyenne). |
| **Profond** | 4,5 resp/min | 5 min | Rythme plus lent, pour une pratique avancée ou pour se rapprocher de sa fréquence de résonance personnelle (généralement entre 4,5 et 7 resp/min). |
| **Express** | 6 resp/min | 3 min | Le rythme de référence en format court, pour un reset rapide dans la journée quand 5 minutes ne sont pas possibles. |

Choisir un autre mode pendant une séance en cours quitte immédiatement le
programme en cours et démarre directement le nouveau.

## Utilisation

- Choisir un mode via le switch en bas de l'écran.
- Toucher le cercle pour démarrer / mettre en pause. Rien n'est écrit dans
  le cercle : la phase (Prêt / Inspire / Expire) s'affiche en bas, entre
  les deux compteurs.
- Le cercle grandit à l'inspiration, se réduit à l'expiration, entre 20 %
  et 90 % de la petite dimension de l'écran (vmin). Un contour statique à
  90 % marque le repère visuel de fin d'inspiration.
- Au repos (avant de démarrer, ou une fois une séance terminée), le cercle
  se réduit à 10 % et sa couleur passe à 50 % d'opacité ; il repasse à
  pleine opacité dès qu'une séance démarre.
- Sous le cercle : temps écoulé à gauche, temps restant à droite, avec une
  barre de progression de la séance entre les deux.
- L'écran reste allumé pendant une séance active (Screen Wake Lock, quand
  le navigateur le supporte).

## Structure

Site statique, sans framework ni dépendance :

```
index.html    structure de la page
styles.css    design (fond sombre, cercle, switch de modes)
app.js        logique des modes, animation du souffle, minuteur
manifest.json  PWA (installable sur l'écran d'accueil)
sw.js          service worker (cache, fonctionnement hors-ligne)
icons/         icônes PWA (192, 512, apple-touch-icon, favicons)
```

Projet personnel.
