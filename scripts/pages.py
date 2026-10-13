"""Génère les pages d'information du site (mentions légales, CGU, confidentialité, IA, accessibilité, plan du site)
ainsi que sitemap.xml et robots.txt. Toutes partagent pages.css et la police auto-hébergée.

Les informations de l'éditeur sont regroupées dans EDITEUR : c'est le seul endroit à modifier.
Une valeur None s'affiche « à compléter » en surbrillance, pour ne rien publier d'inexact.
"""
import json, html, datetime as dt

SITE = "https://batiazur-hub.github.io/sorties-bourbonnais-loire/"
MAJ = "13 octobre 2026"
EDITEUR = {
    "nom": "Pulsar Digital",
    "forme": "entreprise individuelle (micro-entreprise) de Clément Monteiro",
    "responsable": "Clément Monteiro",
    "siret": None,        # en cours d'immatriculation
    "adresse": None,      # adresse de l'entreprise
    "email": None,        # adresse de contact publique
}

def v(cle):
    x = EDITEUR.get(cle)
    return html.escape(x) if x else '<mark class="todo">à compléter</mark>'

def mail():
    x = EDITEUR.get("email")
    return f'<a href="mailto:{html.escape(x)}">{html.escape(x)}</a>' if x else v("email")

NAV = [("index.html", "Accueil"), ("plan-du-site.html", "Plan du site"), ("mentions-legales.html", "Mentions légales"),
       ("cgu.html", "Conditions d’utilisation"), ("confidentialite.html", "Confidentialité"),
       ("intelligence-artificielle.html", "Intelligence artificielle"), ("accessibilite.html", "Accessibilité")]

def page(fichier, titre, intro, corps):
    nav = "".join(f'<a href="{h}"' + (' aria-current="page"' if h == fichier else "") + f">{t}</a>" for h, t in NAV[1:])
    return f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{titre} · Dans le coin</title>
<meta name="description" content="{html.escape(intro)}">
<link rel="stylesheet" href="fonts/figtree.css">
<link rel="stylesheet" href="pages.css">
</head>
<body>
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="top"><a class="brand" href="index.html"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2.5c-4 0-7.3 3.2-7.3 7.2 0 5.3 6.4 11.4 6.7 11.7.3.3.9.3 1.2 0 .3-.3 6.7-6.4 6.7-11.7 0-4-3.3-7.2-7.3-7.2zm0 9.9a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z"/></svg>Dans le coin</a>
<a class="back" href="index.html">Retour aux sorties</a></header>
<main id="contenu">
<h1>{titre}</h1>
<p class="lead">{intro}</p>
<p class="maj">Mise à jour : {MAJ}</p>
{corps}
</main>
<footer class="foot"><nav aria-label="Informations légales">{nav}</nav></footer>
</body>
</html>
"""

SOURCES = [
    ("DATAtourisme", "https://www.data.gouv.fr/fr/datasets/5b598be088ee387c0c353714/", "offices de tourisme, comités départementaux et régionaux du tourisme", "Licence Ouverte (Etalab)"),
    ("OpenAgenda — événements publics", "https://public.opendatasoft.com/explore/dataset/evenements-publics-openagenda/", "agendas des communes, médiathèques, associations et lieux culturels", "licence indiquée par OpenAgenda"),
    ("Que faire à Paris", "https://opendata.paris.fr/explore/dataset/que-faire-a-paris-/", "Ville de Paris", "ODbL"),
    ("Marchés découverts", "https://opendata.paris.fr/explore/dataset/marches-decouverts/", "Ville de Paris", "ODbL"),
    ("Offre touristique — fêtes et manifestations", "https://data.paysdelaloire.fr/", "Région des Pays de la Loire", "licence indiquée par la Région"),
    ("Fêtes et manifestations", "https://data.opendatasoft.com/explore/dataset/fetes-et-manifestations@data-herault-occitanie/", "Hérault Tourisme", "licence indiquée par le producteur"),
    ("Agenda des événements", "https://www.data.gouv.fr/", "Région Occitanie", "licence indiquée par la Région"),
    ("Agenda des manifestations", "https://www.data.gouv.fr/", "Pas-de-Calais Tourisme", "licence indiquée par le producteur"),
    ("Agenda", "https://opendata.clermontmetropole.eu/", "Clermont Auvergne Métropole", "licence indiquée par le producteur"),
    ("Agenda culturel et marchés", "https://data.toulouse-metropole.fr/", "Toulouse Métropole", "Licence Ouverte"),
    ("Agendas locaux", "https://www.data.gouv.fr/", "Nice Côte d’Azur, Grand Paris Seine Ouest, Île-de-France Nature, musées de l’Isère", "licence indiquée par chaque producteur"),
    ("Programme des manifestations", "https://www.lepal.com/", "Fondation Le PAL Nature", "reproduit à titre d’information"),
    ("Découpage administratif et centres des communes", "https://geo.api.gouv.fr/", "API Géo (État)", "Licence Ouverte"),
]

P = {}

P["mentions-legales.html"] = ("Mentions légales", "Qui publie ce site, qui l’héberge et d’où viennent les informations affichées.", f"""
<h2>Éditeur</h2>
<dl class="kv">
<dt>Nom</dt><dd>{v("nom")}, {v("forme")}</dd>
<dt>SIRET</dt><dd>{v("siret")}</dd>
<dt>Adresse</dt><dd>{v("adresse")}</dd>
<dt>Contact</dt><dd>{mail()}</dd>
<dt>Directeur de la publication</dt><dd>{v("responsable")}</dd>
</dl>

<h2>Hébergement</h2>
<p>GitHub, Inc. (service GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis. <a href="https://github.com/contact">github.com/contact</a></p>

<h2 id="sources">Origine des informations</h2>
<p>Dans le coin rassemble des agendas publiés en données ouvertes par des collectivités, des offices de tourisme et des organisateurs. Les fiches sont reprises automatiquement chaque nuit, avec un lien vers la source. Chaque donnée reste soumise à la licence de son producteur.</p>
<div class="tbl"><table>
<thead><tr><th scope="col">Jeu de données</th><th scope="col">Producteur</th><th scope="col">Licence</th></tr></thead>
<tbody>
{"".join(f'<tr><td><a href="{u}">{html.escape(n)}</a></td><td>{html.escape(p)}</td><td>{html.escape(l)}</td></tr>' for n, u, p, l in SOURCES)}
</tbody></table></div>
<p>Les sorties proposées par les visiteurs sont relues avant d’être publiées. Le nom de la source figure sur chaque fiche.</p>

<h2>Cartes, photos et affiches</h2>
<ul>
<li>Fonds de carte : Plan IGN et photographies aériennes © IGN, diffusés par la Géoplateforme (<a href="https://cartes.gouv.fr/">cartes.gouv.fr</a>), Licence Ouverte.</li>
<li>Affichage de la carte : bibliothèque <a href="https://maplibre.org/">MapLibre GL JS</a>, licence BSD.</li>
<li>Photos des communes : <a href="https://fr.wikipedia.org/">Wikipédia</a> et <a href="https://commons.wikimedia.org/">Wikimedia Commons</a>, sous la licence indiquée sur la page de chaque image.</li>
<li>Affiches et visuels d’événements : propriété de leurs auteurs ou des organisateurs. Ils sont affichés tels que publiés par la source, pour annoncer l’événement.</li>
<li>Police de caractères : Figtree, SIL Open Font License.</li>
</ul>

<h2>Retrait ou correction</h2>
<p>Un organisateur, un auteur ou un ayant droit peut demander la correction ou le retrait d’une fiche, d’une affiche ou d’une photo en écrivant à {mail()}. La demande est traitée dans les meilleurs délais.</p>

<h2>Propriété du site</h2>
<p>La mise en page, le code et le nom « Dans le coin » appartiennent à l’éditeur. Les données reprises appartiennent à leurs producteurs respectifs.</p>
""")

P["cgu.html"] = ("Conditions générales d’utilisation", "Les règles d’utilisation du site et des contributions.", f"""
<h2>1. Objet</h2>
<p>Dans le coin est un agenda gratuit des sorties en France : fêtes, marchés, brocantes, spectacles, expositions, activités en famille et événements sportifs. Ces conditions encadrent l’utilisation du site, y compris lorsqu’il est intégré dans un autre site, une borne ou une application. En utilisant le site, vous les acceptez.</p>

<h2>2. Accès</h2>
<p>Le site est accessible gratuitement et sans inscription. L’éditeur peut l’interrompre pour maintenance ou le faire évoluer à tout moment, sans que cela ouvre droit à indemnité.</p>

<h2>3. Fiabilité des informations</h2>
<p>Les sorties proviennent de sources publiques et de propositions des visiteurs. Elles sont mises à jour chaque nuit, mais un organisateur peut modifier, reporter ou annuler un événement à tout moment. <strong>Vérifiez toujours la date, l’horaire et le lieu sur la fiche source avant de vous déplacer.</strong> L’éditeur n’organise aucun des événements présentés et n’en est pas responsable.</p>

<h2>4. Proposer une sortie ou une source</h2>
<p>Chacun peut proposer une sortie ou signaler un agenda. En envoyant une proposition, vous garantissez :</p>
<ul>
<li>que les informations sont exactes et concernent un événement réel ouvert au public ;</li>
<li>que vous avez le droit de diffuser le texte, le lien et l’affiche indiqués ;</li>
<li>que le contenu ne contient ni propos injurieux, discriminatoires ou diffamatoires, ni publicité déguisée, ni données personnelles d’un tiers sans son accord.</li>
</ul>
<p>Les propositions sont filtrées automatiquement puis relues par une personne avant publication. L’éditeur peut refuser, raccourcir ou corriger une proposition, et retirer une fiche à tout moment. Vous autorisez la diffusion gratuite de votre proposition sur le site et sur les sites, bornes et applications qui l’intègrent.</p>

<h2>5. Liens et services externes</h2>
<p>Les fiches renvoient vers les sites des organisateurs, des offices de tourisme et vers des applications de navigation (Waze, Apple Plans, Google Maps) ou d’agenda. Ces services ont leurs propres conditions et l’éditeur n’en est pas responsable.</p>

<h2>6. Propriété intellectuelle</h2>
<p>Voir les <a href="mentions-legales.html">mentions légales</a>. Les données d’agenda reprises restent sous la licence de leur producteur ; la réutilisation du code ou de la mise en page du site nécessite l’accord de l’éditeur.</p>

<h2>7. Données personnelles</h2>
<p>Le site fonctionne sans compte et sans traceur publicitaire. Le détail figure dans la <a href="confidentialite.html">politique de confidentialité</a>.</p>

<h2>8. Signaler un contenu</h2>
<p>Pour signaler une fiche erronée ou un contenu illicite : {mail()}. Indiquez le titre de la fiche et la raison du signalement.</p>

<h2>9. Modification et droit applicable</h2>
<p>Ces conditions peuvent évoluer ; la date de mise à jour figure en haut de la page. Elles sont soumises au droit français. En cas de litige, une solution amiable sera recherchée avant toute action devant les tribunaux compétents.</p>
""")

P["confidentialite.html"] = ("Politique de confidentialité", "Ce que le site enregistre, ce qu’il n’enregistre pas, et vos droits.", f"""
<h2>En résumé</h2>
<ul class="sum">
<li>Pas de compte, pas de cookie publicitaire, pas de mesure d’audience.</li>
<li>Vos choix (département, recherche) restent dans votre navigateur.</li>
<li>Votre position, si vous l’autorisez, sert seulement à trouver les communes proches, sur votre appareil. Elle n’est envoyée nulle part.</li>
</ul>

<h2>Responsable du traitement</h2>
<p>{v("nom")}, {v("responsable")}. Contact : {mail()}.</p>

<h2>Ce qui est enregistré sur votre appareil</h2>
<p>Le site utilise le stockage local du navigateur, sans cookie, pour deux choses strictement utiles au service :</p>
<ul>
<li>les départements que vous avez choisis, pour les retrouver à la prochaine visite ;</li>
<li>les adresses des photos de communes déjà trouvées, pour éviter de les rechercher à nouveau.</li>
</ul>
<p>Ces informations ne quittent pas votre appareil. Vous pouvez les effacer depuis les réglages de votre navigateur (données de site). Comme elles sont nécessaires au fonctionnement demandé, elles ne nécessitent pas de bandeau de consentement selon les recommandations de la CNIL.</p>

<h2>Propositions de sorties et de sources</h2>
<p>Quand vous proposez une sortie ou une source, le contenu du formulaire (titre, date, lieu, description, liens, organisateur) est transmis à l’éditeur pour relecture. Aucun nom, e-mail ni téléphone n’est demandé : n’indiquez pas de données personnelles dans la description. Les propositions refusées sont supprimées sous trois mois ; les sorties publiées ne sont plus affichées après leur date.</p>
<p>Base légale : l’intérêt légitime de l’éditeur à publier un agenda complet et à jour.</p>

<h2>Services tiers contactés par votre navigateur</h2>
<p>Pour afficher la page, votre navigateur contacte les services suivants, qui reçoivent techniquement votre adresse IP :</p>
<div class="tbl"><table>
<thead><tr><th scope="col">Service</th><th scope="col">Pourquoi</th></tr></thead>
<tbody>
<tr><td>GitHub Pages (hébergeur, États-Unis)</td><td>Héberge le site. Conserve des journaux techniques pour la sécurité. Transferts encadrés par le Data Privacy Framework UE–États-Unis.</td></tr>
<tr><td>Géoplateforme de l’IGN (France)</td><td>Fonds de carte.</td></tr>
<tr><td>jsDelivr</td><td>Fournit la bibliothèque d’affichage de la carte.</td></tr>
<tr><td>Wikipédia / Wikimedia</td><td>Photos des communes.</td></tr>
<tr><td>Sites des organisateurs</td><td>Affiches des événements, chargées depuis la source.</td></tr>
</tbody></table></div>
<p>La police de caractères est hébergée sur le site lui-même : aucun appel à Google Fonts.</p>
<p>Lorsque vous ouvrez un itinéraire ou ajoutez une sortie à votre agenda, vous quittez le site pour Waze, Apple Plans, Google Maps, Google Agenda ou Outlook, qui appliquent leur propre politique.</p>

<h2>Vos droits</h2>
<p>Vous disposez d’un droit d’accès, de rectification, d’effacement, d’opposition et de limitation sur les données vous concernant. Écrivez à {mail()}. Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la <a href="https://www.cnil.fr/fr/plaintes">CNIL</a>.</p>
""")

P["intelligence-artificielle.html"] = ("Intelligence artificielle", "Transparence sur l’usage de l’intelligence artificielle, conformément au règlement européen sur l’IA (AI Act).", """
<h2>Le site n’utilise pas d’IA pour vous répondre</h2>
<p>Dans le coin ne comporte ni assistant conversationnel, ni recommandation personnalisée, ni reconnaissance d’images ou de visages. Aucune décision vous concernant n’est prise par un système d’intelligence artificielle.</p>

<h2>Comment les sorties sont triées</h2>
<ul>
<li><strong>Classement par type</strong> (brocante, fête, spectacle…) : règles fixes fondées sur des mots du titre et les catégories des sources. Ces règles sont écrites à la main et publiques dans le code du site.</li>
<li><strong>Recherche</strong> (« brocante ce week-end à Moulins ») : lecture des dates, des communes et des mots-clés par des règles fixes, sur votre appareil.</li>
<li><strong>Textes des fiches</strong> : ce sont ceux des sources, raccourcis automatiquement. Ils ne sont ni réécrits ni générés par une IA.</li>
<li><strong>Filtre des propositions</strong> : liste de mots interdits, puis relecture par une personne.</li>
</ul>

<h2>Ce qui a été fait avec l’aide d’une IA</h2>
<p>Le code du site, ses programmes de collecte et une partie des textes de ces pages ont été rédigés avec l’aide d’un assistant d’intelligence artificielle (Claude, d’Anthropic), sous la direction et la responsabilité éditoriale de l’éditeur, qui les a relus et validés. Aucune image ou affiche présentée sur le site n’a été générée par une IA.</p>

<h2>Cadre réglementaire</h2>
<p>Le règlement (UE) 2024/1689 sur l’intelligence artificielle impose, depuis le 2 août 2026, des obligations de transparence (article 50) : signaler qu’on s’adresse à une IA, marquer les contenus générés, indiquer les textes d’information publiés par une IA sans contrôle humain. Le fonctionnement actuel du site n’entre dans aucun de ces cas. Si une fonction d’IA est ajoutée un jour (par exemple la lecture automatique d’affiches), elle sera signalée sur cette page et à l’endroit où elle intervient.</p>

<h2>Une question ?</h2>
<p>Voir les coordonnées dans les <a href="mentions-legales.html">mentions légales</a>.</p>
""")

P["accessibilite.html"] = ("Accessibilité", "Ce qui a été vérifié pour que le site soit lisible et utilisable par tous, et ses limites connues.", f"""
<h2>État</h2>
<p>Le site n’a pas encore fait l’objet d’un audit complet selon le référentiel RGAA. Un contrôle interne a été réalisé le {MAJ} : outil automatique axe-core, navigation au clavier, zoom à 200 %, contrastes, et affichage sur ordinateur, tablette et téléphones, y compris pliables.</p>

<h2>Ce qui est en place</h2>
<ul>
<li>Textes d’au moins 16 pixels, contrastes conformes au niveau AA, mode sombre automatique.</li>
<li>Navigation complète au clavier, focus visible, lien d’accès direct au contenu sur les pages d’information.</li>
<li>Champs de formulaire tous libellés, messages d’erreur lus par les lecteurs d’écran.</li>
<li>Cibles tactiles d’au moins 44 pixels sur téléphone et en mode borne (adresse terminée par <code>#borne</code>).</li>
<li>Mise en page adaptée de 280 pixels de large (téléphone pliable fermé) aux grands écrans.</li>
</ul>

<h2>Limites connues</h2>
<ul>
<li>La carte n’est pas utilisable avec un lecteur d’écran. La liste et le calendrier présentent les mêmes sorties et restent l’alternative complète.</li>
<li>Les affiches d’événements proviennent des organisateurs et n’ont pas toujours de description textuelle ; le titre et le texte de la fiche en donnent l’essentiel.</li>
</ul>

<h2>Signaler un problème</h2>
<p>Si vous ne parvenez pas à accéder à une information, écrivez à {mail()} : une réponse ou une version accessible vous sera proposée.</p>
""")

DEPS = json.load(open("data/departements.json"))["departements"]
deps_li = "".join(f'<li><a href="index.html#dep={d["code"]}">{html.escape(d["nom"])}</a> <span>{d["code"]}</span></li>' for d in sorted(DEPS, key=lambda d: d["code"].replace("2A", "20A").replace("2B", "20B").zfill(3)) if d.get("n"))
P["plan-du-site.html"] = ("Plan du site", "Toutes les pages et tous les départements couverts.", f"""
<h2>Les sorties</h2>
<ul>
<li><a href="index.html">Rechercher une sortie</a> : liste, carte et calendrier</li>
<li><a href="index.html#q=ce%20week-end">Ce week-end</a> · <a href="index.html#q=brocante">Brocantes et vide-greniers</a> · <a href="index.html#q=march%C3%A9">Marchés</a> · <a href="index.html#q=gratuit">Sorties gratuites</a></li>
<li><a href="index.html#proposer">Proposer une sortie</a></li>
<li><a href="index.html#source">Signaler une source d’événements</a></li>
<li><a href="index.html#borne">Mode borne tactile</a></li>
</ul>
<h2>Informations</h2>
<ul>
{"".join(f'<li><a href="{h}">{t}</a></li>' for h, t in NAV[2:])}
</ul>
<h2>Par département</h2>
<ul class="cols">{deps_li}</ul>
""")

for f, (t, intro, corps) in P.items():
    open(f, "w").write(page(f, t, intro, corps))

urls = ["", "plan-du-site.html", "mentions-legales.html", "cgu.html", "confidentialite.html", "intelligence-artificielle.html", "accessibilite.html"]
jour = dt.date.today().isoformat()
open("sitemap.xml", "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    "".join(f"  <url><loc>{SITE}{u}</loc><lastmod>{jour}</lastmod><changefreq>{'daily' if not u else 'monthly'}</changefreq></url>\n" for u in urls) + "</urlset>\n")
open("robots.txt", "w").write(f"User-agent: *\nAllow: /\nDisallow: /data/enrich/\nSitemap: {SITE}sitemap.xml\n")
print("Pages :", ", ".join(P))
