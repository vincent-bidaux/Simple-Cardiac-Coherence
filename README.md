# Simple Cardiac Coherence

Une app de cohérence cardiaque minimaliste : un cercle bleu clair sur fond
sombre grandit à l'inspiration et se réduit à l'expiration, au rythme choisi.

- **Site** : https://simple-cardiac-coherence.abpq.cc
- **Dépôt GitHub** : `vincent-bidaux/simple-cardiac-coherence`

Aucune étape de build : c'est du HTML/CSS/JS statique, servi tel quel.
Cloudflare (Workers Builds) déploie automatiquement à chaque push sur `main`
(config dans `wrangler.jsonc`, fichiers servis dans `public/`, en-têtes dans `public/_headers`).
