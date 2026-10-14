"""Génère les pages d'information du site (mentions légales, CGU, confidentialité, IA, accessibilité, plan du site)
ainsi que sitemap.xml et robots.txt. Toutes partagent pages.css et la police auto-hébergée.

Les informations de l'éditeur sont regroupées dans EDITEUR : c'est le seul endroit à modifier.
Une valeur None s'affiche « à compléter » en surbrillance, pour ne rien publier d'inexact.
"""
import json, html, os, datetime as dt

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.environ.get("PAGES_SORTIE", RACINE)  # dossier où écrire les pages (le contrôle qualité les génère à part)

SITE = "https://batiazur-hub.github.io/sorties-bourbonnais-loire/"
MAJ = "14 octobre 2026"
EDITEUR = {
    "nom": "Clément Monteiro EI",
    "forme": "entrepreneur individuel (micro-entreprise), nom commercial « Saryn Digital »",
    "responsable": "Clément Monteiro",
    "siren": "109 916 320",
    "siret": "109 916 320 00012",
    "registre": "Registre national des entreprises (RNE), immatriculation du 17 septembre 2026",
    "ape": "6201Z (programmation informatique)",
    "adresse": "6 rue Les Lauriers, 58300 Decize, France",
    "email": "clementer@gmail.com",
}

def v(cle):
    x = EDITEUR.get(cle)
    return html.escape(x) if x else '<mark class="todo">à compléter</mark>'

def mail():
    x = EDITEUR.get("email")
    return f'<a href="mailto:{html.escape(x)}">{html.escape(x)}</a>' if x else v("email")

NAV = [("index.html", "Accueil"), ("plan-du-site.html", "Plan du site"), ("mentions-legales.html", "Mentions légales"),
       ("cgu.html", "Conditions d’utilisation"), ("confidentialite.html", "Confidentialité"),
       ("intelligence-artificielle.html", "Intelligence artificielle"), ("accessibilite.html", "Accessibilité"), ("integrer.html", "Intégrer l’agenda"), ("api.html", "API")]

TETE = {}
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
<link rel="stylesheet" href="pages.css">{TETE.get(fichier, "")}
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
    ("Horaires d’ouverture des lieux et offices de tourisme", "https://www.openstreetmap.org/copyright", "© les contributeurs d’OpenStreetMap", "ODbL"),
    ("Découpage administratif et centres des communes", "https://geo.api.gouv.fr/", "API Géo (État)", "Licence Ouverte"),
]

P = {}

P["mentions-legales.html"] = ("Mentions légales", "Qui publie ce site, qui l’héberge et d’où viennent les informations affichées.", f"""
<h2>Éditeur</h2>
<dl class="kv">
<dt>Nom</dt><dd>{v("nom")}, {v("forme")}</dd>
<dt>SIREN / SIRET</dt><dd>{v("siren")} / {v("siret")}</dd>
<dt>Immatriculation</dt><dd>{v("registre")}</dd>
<dt>Code APE</dt><dd>{v("ape")}</dd>
<dt>Adresse</dt><dd>{v("adresse")}</dd>
<dt>Contact</dt><dd>{mail()}</dd>
<dt>Directeur de la publication</dt><dd>{v("responsable")}</dd>
<dt>Conception et développement</dt><dd>Saryn Digital</dd>
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
<p>{v("nom")} (Saryn Digital), {v("adresse")}. Contact : {mail()}.</p>

<h2>Ce qui est enregistré sur votre appareil</h2>
<p>Le site utilise le stockage local du navigateur, sans cookie, pour quelques réglages strictement utiles au service :</p>
<ul>
<li>les départements que vous avez choisis, pour les retrouver à la prochaine visite ;</li>
<li>l’affichage ou non des lieux à visiter sur la carte, la période et les types de sorties montrés sur la carte ;</li>
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
<tr><td>Wikipédia / Wikimedia</td><td>Photos des communes.</td></tr>
<tr><td>Sites des organisateurs</td><td>Affiches des événements, chargées depuis la source.</td></tr>
</tbody></table></div>
<p>La police de caractères et la bibliothèque d’affichage de la carte sont hébergées sur le site lui-même : aucun appel à Google Fonts ni à un réseau de diffusion tiers.</p>
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

DEPS = json.load(open(os.path.join(RACINE, "data/departements.json"), encoding="utf-8"))["departements"]
deps_li = "".join(f'<li><a href="index.html#dep={d["code"]}">{html.escape(d["nom"])}</a> <span>{d["code"]}</span></li>' for d in sorted(DEPS, key=lambda d: d["code"].replace("2A", "20A").replace("2B", "20B").zfill(3)) if d.get("n"))
P["plan-du-site.html"] = ("Plan du site", "Toutes les pages et tous les départements couverts.", f"""
<h2>Les sorties</h2>
<ul>
<li><a href="index.html">Rechercher une sortie</a> : liste, carte et calendrier</li>
<li><a href="index.html#q=ce%20week-end">Ce week-end</a> · <a href="index.html#q=brocante">Brocantes et vide-greniers</a> · <a href="index.html#q=march%C3%A9">Marchés</a> · <a href="index.html#q=gratuit">Sorties gratuites</a></li>
<li><a href="index.html#proposer">Proposer une sortie</a></li>
<li><a href="index.html#source">Signaler une source d’événements</a></li>
<li><a href="index.html#q=Moulins">Lieux à visiter</a> : musées, patrimoine, sites naturels et parcs, affichés sur la carte et sous chaque commune recherchée</li>
<li><a href="index.html#borne">Mode borne tactile</a></li>
</ul>
<h2>Informations</h2>
<ul>
{"".join(f'<li><a href="{h}">{t}</a></li>' for h, t in NAV[2:])}
</ul>
<h2>Par département</h2>
<ul class="cols">{deps_li}</ul>
""")

P["integrer.html"] = ("Intégrer l’agenda", "Ajoutez « Dans le coin » à votre site, votre application ou une borne tactile, aux couleurs de votre charte.", """
<p>L’agenda s’intègre gratuitement. Choisissez vos réglages : le code à copier et l’aperçu se mettent à jour.</p>
<form class="gen" id="gen" onsubmit="return false">
<div class="row"><label for="g-dep">Départements (codes séparés par des virgules)</label><input id="g-dep" value="03,58,71" inputmode="text" autocomplete="off"></div>
<div class="row"><label for="g-col">Couleur des boutons</label><input id="g-col" type="color" value="#151515"></div>
<fieldset class="row"><legend>Usage</legend>
<label class="ck"><input type="radio" name="g-m" value="site" checked> Sur un site ou une application</label>
<label class="ck"><input type="radio" name="g-m" value="borne"> Sur une borne tactile (gros boutons, QR code, retour à l’accueil après 90 s)</label></fieldset>
<fieldset class="row"><legend>Apparence</legend>
<label class="ck"><input type="radio" name="g-t" value="" checked> Suivre le réglage de l’appareil</label>
<label class="ck"><input type="radio" name="g-t" value="clair"> Toujours clair</label>
<label class="ck"><input type="radio" name="g-t" value="sombre"> Toujours sombre</label></fieldset>
</form>
<h2>Code à copier</h2>
<p>À coller dans votre page, à l’endroit où l’agenda doit apparaître. Sa hauteur s’ajuste toute seule.</p>
<textarea id="g-code" class="code" readonly rows="8" aria-label="Code d’intégration"></textarea>
<p><button type="button" class="btn" id="g-copy">Copier le code</button> <span id="g-ok" role="status"></span></p>
<h2>Lien direct (borne, QR code, réseaux sociaux)</h2>
<p><a id="g-link" href="index.html" target="_blank" rel="noopener"></a></p>
<h2>Aperçu</h2>
<div class="prev"><iframe id="g-prev" title="Aperçu de l’agenda intégré" loading="lazy"></iframe></div>
<h2>Bon à savoir</h2>
<ul>
<li>Les données sont mises à jour chaque nuit, sans rien faire de votre côté.</li>
<li>Les visiteurs peuvent proposer des sorties depuis l’agenda intégré ; elles sont relues avant publication.</li>
<li>Pour une charte plus poussée (police, arrondis, couleurs de fond), écrivez-nous : voir les <a href="mentions-legales.html">mentions légales</a>.</li>
</ul>
<script>
(function(){
  const base=new URL("index.html",location.href).href,$=id=>document.getElementById(id);
  function maj(){
    const deps=$("g-dep").value.toUpperCase().split(/[^0-9AB]+/).filter(x=>/^(\\d{2,3}|2A|2B)$/.test(x));
    const m=document.querySelector("[name=g-m]:checked").value,t=document.querySelector("[name=g-t]:checked").value,c=$("g-col").value.slice(1);
    const h=["integre"];if(deps.length)h.push("dep="+deps.join(","));if(m==="borne")h.push("borne");if(t)h.push(t);if(c&&c!=="151515")h.push("couleur="+c);
    const url=base+"#"+h.join("&"),direct=base+"#"+h.filter(x=>x!=="integre").join("&");
    $("g-code").value='<iframe src="'+url+'" title="Agenda des sorties" style="width:100%;height:900px;border:0" loading="lazy" allow="geolocation"></iframe>\\n'+
      '<script>addEventListener("message",function(e){if(e.data&&e.data.dansLeCoin==="hauteur")document.querySelectorAll("iframe").forEach(function(f){if(f.contentWindow===e.source)f.style.height=e.data.h+"px"})});<\\/script>';
    $("g-link").href=direct;$("g-link").textContent=direct;$("g-prev").src=url;
  }
  addEventListener("message",e=>{if(e.data&&e.data.dansLeCoin==="hauteur"&&e.source===$("g-prev").contentWindow)$("g-prev").style.height=Math.min(e.data.h,1400)+"px"});
  $("gen").addEventListener("input",maj);$("gen").addEventListener("change",maj);maj();
  $("g-copy").onclick=async()=>{try{await navigator.clipboard.writeText($("g-code").value);$("g-ok").textContent="Copié."}catch(_){$("g-code").select();$("g-ok").textContent="Sélectionné : copiez avec Ctrl+C."}};
})();
</script>
""")

TETE["api.html"] = '\n<script src="config.js"></script>\n<script src="dlc.js"></script>'
P["api.html"] = ("API Dans le coin", "Ajoutez les sorties et les lieux à visiter de toute la France à votre site ou à votre application : une ligne de script et votre clé, comme pour Google Maps.",
                 open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "api_page.html"), encoding="utf-8").read())

TETE["cles.html"] = '\n<meta name="robots" content="noindex, nofollow">\n<link rel="stylesheet" href="vendor/maplibre-gl-4.7.1/maplibre-gl.css">\n<script src="vendor/maplibre-gl-4.7.1/maplibre-gl.js"></script>\n<script src="config.js"></script>'
P["cles.html"] = ("Générateur de clés API", "Espace éditeur : choisissez la zone et les critères, vérifiez ce que la clé récupérera, puis générez-la.", """
<form class="gen" id="cx" autocomplete="on">
<div class="row"><label for="cx-url">Adresse du serveur</label><input id="cx-url" type="url" placeholder="https://dans-le-coin.compte.workers.dev"></div>
<div class="row"><label for="cx-tok">Code éditeur</label><input id="cx-tok" type="password" autocomplete="current-password"></div>
<p><button class="btn" type="submit">Se connecter</button> <span id="cx-msg" role="status">L’aperçu ci-dessous marche sans connexion ; la connexion sert à créer et gérer les clés.</span></p>
</form>

<h2>1. Zone géographique</h2>
<form class="gen" id="gz" onsubmit="return false">
<fieldset class="row"><legend>Limiter la clé</legend>
<label class="ck"><input type="radio" name="gz-m" value="zone" checked> À une zone autour d’un point (cliquez sur la carte ou indiquez une commune)</label>
<label class="ck"><input type="radio" name="gz-m" value="deps"> À des départements</label>
<label class="ck"><input type="radio" name="gz-m" value="tout"> Toute la France (6 départements par appel)</label></fieldset>
<div class="row" id="gz-zone"><label for="gz-com">Commune au centre</label><input id="gz-com" list="gz-cl" autocomplete="off" placeholder="Decize">
<label for="gz-r">Rayon : <b id="gz-rv">20 km</b></label><input id="gz-r" type="range" min="1" max="150" value="20"></div>
<div class="row" id="gz-deps" hidden><label for="gz-d">Départements (codes)</label><input id="gz-d" placeholder="03,58,71"></div>
</form>
<div class="map" id="gz-map" aria-label="Carte de la zone de la clé"></div>
<datalist id="gz-cl"></datalist>

<h2>2. Critères</h2>
<form class="gen" id="gc" onsubmit="return false">
<fieldset class="row"><legend>Types de sorties et de lieux (aucun coché : tous)</legend>
<div class="ty">
<label class="ck"><input type="checkbox" value="brocante"> Brocantes</label><label class="ck"><input type="checkbox" value="fete"> Fêtes, marchés</label>
<label class="ck"><input type="checkbox" value="spectacle"> Concerts, spectacles</label><label class="ck"><input type="checkbox" value="culture"> Expos, visites</label>
<label class="ck"><input type="checkbox" value="famille"> En famille</label><label class="ck"><input type="checkbox" value="sport"> Sport, rando</label>
<label class="ck"><input type="checkbox" value="office"> Offices de tourisme</label><label class="ck"><input type="checkbox" value="musee"> Musées</label>
<label class="ck"><input type="checkbox" value="patrimoine"> Patrimoine</label><label class="ck"><input type="checkbox" value="nature"> Nature</label>
<label class="ck"><input type="checkbox" value="loisirs"> Loisirs</label></div></fieldset>
<div class="row"><label for="gc-j">Sorties jusqu’à</label><select id="gc-j"><option value="0">sans limite</option><option value="7">7 jours</option><option value="30" selected>30 jours</option><option value="90">3 mois</option></select></div>
<label class="ck"><input type="checkbox" id="gc-l" checked> Donner aussi accès aux lieux à visiter et offices</label>
</form>

<h2>3. Ce que la clé récupérera</h2>
<p id="ap-n" class="lead">Choisissez une zone.</p>
<div id="ap-l"></div>

<h2>4. Générer la clé</h2>
<form class="gen" id="nk">
<div class="row"><label for="nk-nom">Nom (structure) *</label><input id="nk-nom" required maxlength="80" placeholder="Office de tourisme du Sud Nivernais"></div>
<div class="row"><label for="nk-contact">Contact</label><input id="nk-contact" maxlength="120" placeholder="adresse e-mail"></div>
<div class="row"><label for="nk-quota">Appels par jour (0 : illimité)</label><input id="nk-quota" type="number" min="0" value="5000"></div>
<div class="row"><label for="nk-orig">Sites autorisés (vide : tous)</label><input id="nk-orig" placeholder="https://www.ville-decize.fr"></div>
<div class="row"><label for="nk-notes">Notes</label><input id="nk-notes" maxlength="300"></div>
<p><button class="btn" type="submit">Générer la clé</button> <span id="nk-msg" role="status"></span></p>
<div id="nk-out" hidden><p><b>Clé :</b> <code id="nk-k"></code> <button type="button" class="btn" id="nk-cp">Copier</button></p>
<p>Exemple d’appel :</p><pre class="code" id="nk-ex"></pre></div>
</form>

<div id="zone" hidden><h2>Clés existantes</h2><div id="liste"></div></div>
<script>
(function(){
  const $=id=>document.getElementById(id),N=s=>String(s||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase();
  const kmd=(a,b,c,d)=>Math.hypot((d-b)*Math.cos((a+c)/2*Math.PI/180)*111.32,(c-a)*110.57);
  let base="",tok="",DEPS=null,COMS=null,centre={lat:46.83,lon:3.46,nom:"Decize (58)"},map=null;const CACHE={};
  try{base=sessionStorage.getItem("dlc-url")||(window.SORTIES_CONFIG&&SORTIES_CONFIG.apiUrl)||"";tok=sessionStorage.getItem("dlc-tok")||""}catch(_){}
  $("cx-url").value=base;$("cx-tok").value=tok;
  const call=async(path,body)=>{if(!base||!tok)throw new Error("connectez-vous d’abord");const r=await fetch(base.replace(/\\/+$/,"")+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",Authorization:"Bearer "+tok},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.erreur||("erreur "+r.status));return j};
  const get=u=>CACHE[u]||(CACHE[u]=fetch(u).then(r=>r.ok?r.json():[]).catch(()=>[]));
  const mode=()=>document.querySelector("[name=gz-m]:checked").value,rayon=()=>+$("gz-r").value;
  const types=()=>[...document.querySelectorAll("#gc .ty input:checked")].map(x=>x.value);
  const TS=["brocante","fete","spectacle","culture","famille","sport"],TL=["office","musee","patrimoine","nature","loisirs"];
  const NOMS={brocante:"Brocante",fete:"Fête, marché",spectacle:"Concert, spectacle",culture:"Expo, visite",famille:"En famille",sport:"Sport, rando",pal:"Le Pal",office:"Office de tourisme",musee:"Musée",patrimoine:"Patrimoine",nature:"Nature",loisirs:"Loisirs"};
  function depsVoulus(){if(mode()==="deps")return $("gz-d").value.toUpperCase().split(/[^0-9AB]+/).filter(x=>/^(\\d{2,3}|2A|2B)$/.test(x)).slice(0,8);
    if(mode()==="zone"&&DEPS)return DEPS.map(d=>[d.code,kmd(centre.lat,centre.lon,d.lat,d.lon)]).filter(x=>x[1]<=rayon()+90).sort((a,b)=>a[1]-b[1]).slice(0,8).map(x=>x[0]);return[]}
  function cercle(){const pts=[],r=rayon();for(let i=0;i<=64;i++){const a=i/64*2*Math.PI;pts.push([centre.lon+r/(111.32*Math.cos(centre.lat*Math.PI/180))*Math.cos(a),centre.lat+r/110.57*Math.sin(a)])}
    return{type:"FeatureCollection",features:mode()==="zone"?[{type:"Feature",geometry:{type:"Polygon",coordinates:[pts]},properties:{}}]:[]}}
  function points(L){return{type:"FeatureCollection",features:L.map(x=>({type:"Feature",geometry:{type:"Point",coordinates:[x.lon,x.lat]},properties:{l:x._l?1:0}}))}}
  let tm=null;const maj=()=>{clearTimeout(tm);tm=setTimeout(apercu,250)};
  async function apercu(){
    $("gz-zone").hidden=mode()!=="zone";$("gz-deps").hidden=mode()!=="deps";$("gz-rv").textContent=rayon()+" km";
    if(map&&map.getSource("z"))map.getSource("z").setData(cercle());
    const deps=depsVoulus();if(!deps.length){$("ap-n").textContent=mode()==="tout"?"Toute la France : chaque appel devra préciser ses départements (6 au plus).":"Indiquez une zone ou des départements.";$("ap-l").textContent="";if(map&&map.getSource("p"))map.getSource("p").setData(points([]));return}
    $("ap-n").textContent="Calcul…";
    const ty=types(),ts=ty.filter(t=>TS.includes(t)),tl=ty.filter(t=>TL.includes(t)),j=+$("gc-j").value,auj=new Date().toISOString().slice(0,10),lim=j?new Date(Date.now()+j*864e5).toISOString().slice(0,10):"9999";
    const dz=x=>mode()!=="zone"||kmd(centre.lat,centre.lon,x.lat,x.lon)<=rayon();
    let E=[],L=[];for(const d of deps){E=E.concat(await get("data/dep/"+d+".json"));if($("gc-l").checked)L=L.concat(await get("data/lieux/"+d+".json"))}
    E=E.filter(e=>(!ts.length||ts.includes(e.cat))&&(ty.length&&!ts.length?false:true)&&(e.e||e.s)>=auj&&e.s<=lim&&dz(e));
    L=L.filter(x=>(!tl.length?!(ty.length&&!tl.length):tl.includes(x.k))&&dz(x));
    const parT={};E.forEach(e=>parT[e.cat]=(parT[e.cat]||0)+1);L.forEach(x=>parT[x.k]=(parT[x.k]||0)+1);
    $("ap-n").textContent=E.length.toLocaleString("fr-FR")+" sorties"+(j?" sur "+j+" jours":" à venir")+" et "+L.length.toLocaleString("fr-FR")+" lieux"+(mode()==="zone"?" dans un rayon de "+rayon()+" km autour de "+centre.nom:" dans "+deps.join(", "))+".";
    const box=$("ap-l");box.innerHTML="";const t=document.createElement("p");t.textContent=Object.entries(parT).sort((a,b)=>b[1]-a[1]).map(([k,v])=>(NOMS[k]||k)+" : "+v).join(" · ");box.append(t);
    const ul=document.createElement("ul");E.sort((a,b)=>a.s<b.s?-1:1).slice(0,6).forEach(e=>{const li=document.createElement("li");li.textContent=e.s.split("-").reverse().join("/")+" · "+e.t+" · "+e.w;ul.append(li)});box.append(ul);
    if(map&&map.getSource("p"))map.getSource("p").setData(points(E.concat(L.map(x=>Object.assign({_l:1},x))).slice(0,4000)));
  }
  function initMap(){if(!window.maplibregl)return;
    map=new maplibregl.Map({container:"gz-map",style:"https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json",center:[centre.lon,centre.lat],zoom:8,attributionControl:{compact:true,customAttribution:"Plan IGN © IGN"}});
    map.addControl(new maplibregl.NavigationControl({showCompass:false}));
    map.on("load",()=>{map.addSource("z",{type:"geojson",data:cercle()});map.addLayer({id:"zf",type:"fill",source:"z",paint:{"fill-color":"#f07d00","fill-opacity":.12}});map.addLayer({id:"zl",type:"line",source:"z",paint:{"line-color":"#f07d00","line-width":2}});
      map.addSource("p",{type:"geojson",data:points([])});map.addLayer({id:"p",type:"circle",source:"p",paint:{"circle-radius":4,"circle-color":["case",["==",["get","l"],1],"#1c64b8","#d6336c"],"circle-stroke-color":"#fff","circle-stroke-width":1}});apercu()});
    map.on("click",e=>{centre={lat:e.lngLat.lat,lon:e.lngLat.lng,nom:"le point choisi"};const near=COMS&&COMS.reduce((b,c)=>{const d=kmd(centre.lat,centre.lon,c[2],c[3]);return d<b[0]?[d,c]:b},[1e9,null]);if(near&&near[1]&&near[0]<8){centre.nom=near[1][0]+" ("+near[1][1]+")";$("gz-com").value=centre.nom}maj()})}
  get("data/departements.json").then(d=>{DEPS=d.departements||[];maj()});
  const K=s=>N(s).replace(/[-']/g," ").replace(/\\s+/g," ").trim();
  get("data/communes-fr.json").then(a=>{COMS=a});
  $("gz-com").addEventListener("input",()=>{if(!COMS)return;const v=K($("gz-com").value.replace(/\\s*\\([^)]*\\)\\s*$/,""));if(v.length<2)return;
    $("gz-cl").innerHTML=COMS.filter(c=>K(c[0]).startsWith(v)).slice(0,40).map(c=>'<option value="'+(c[0]+" ("+c[1]+")").replace(/"/g,"&quot;")+'">').join("")});
  /* « Moulins (03) » ; sans département, on prend l'homonyme le plus proche de la zone actuelle */
  $("gz-com").addEventListener("change",()=>{if(!COMS)return;const raw=$("gz-com").value,m=raw.match(/\\(([0-9AB]{2,3})\\)\\s*$/i),v=K(raw.replace(/\\s*\\([^)]*\\)\\s*$/,""));
    const cand=COMS.filter(c=>K(c[0])===v&&(!m||c[1]===m[1].toUpperCase()));if(!cand.length)return;
    const c=cand.sort((a,b)=>kmd(centre.lat,centre.lon,a[2],a[3])-kmd(centre.lat,centre.lon,b[2],b[3]))[0];
    centre={lat:c[2],lon:c[3],nom:c[0]+" ("+c[1]+")"};$("gz-com").value=centre.nom;if(map)map.flyTo({center:[c[3],c[2]],zoom:9});maj()});
  ["gz","gc"].forEach(id=>{$(id).addEventListener("input",maj);$(id).addEventListener("change",maj)});
  initMap();
  async function charger(){
    const d=await call("/admin/cles"),Ls=$("liste");Ls.textContent="";$("zone").hidden=false;
    if(!d.cles.length){Ls.innerHTML="<p>Aucune clé pour l’instant.</p>";return}
    d.cles.sort((a,b)=>(a.cree<b.cree?1:-1)).forEach(k=>{
      const c=document.createElement("div");c.className="gen";
      c.innerHTML='<p><b class="n"></b> <span class="et"></span></p><p><code class="k"></code> <button type="button" class="btn cp">Copier</button></p><p class="d"></p><p><button type="button" class="btn rv"></button></p>';
      c.querySelector(".n").textContent=k.nom;c.querySelector(".et").textContent=k.active===false?"· révoquée":"· active";c.querySelector(".k").textContent=k.cle;
      c.querySelector(".d").textContent=(k.zone?"Zone : "+k.zone.rayon+" km autour de "+(k.zone.nom||k.zone.lat+","+k.zone.lon)+" · ":"")+"Départements : "+((k.deps||[]).join(", ")||"tous")+" · Types : "+((k.types||[]).join(", ")||"tous")+(k.jours?" · "+k.jours+" jours":"")+" · Quota : "+(k.quota||"illimité")+"/jour · Aujourd’hui : "+k.appels_aujourdhui+" appels"+(k.contact?" · "+k.contact:"");
      c.querySelector(".cp").onclick=()=>navigator.clipboard.writeText(k.cle).catch(()=>{});
      const rv=c.querySelector(".rv");rv.textContent=k.active===false?"Réactiver":"Révoquer";
      rv.onclick=async()=>{if(k.active!==false&&!confirm("Révoquer la clé de « "+k.nom+" » ?"))return;await call(k.active===false?"/admin/cles/reactiver":"/admin/cles/revoquer",{cle:k.cle});charger()};
      Ls.append(c)});
  }
  $("cx").onsubmit=async e=>{e.preventDefault();base=$("cx-url").value.trim();tok=$("cx-tok").value.trim();
    try{await charger();$("cx-msg").textContent="Connecté.";try{sessionStorage.setItem("dlc-url",base);sessionStorage.setItem("dlc-tok",tok)}catch(_){}}
    catch(err){$("cx-msg").textContent="Connexion refusée ("+err.message+")."}};
  $("nk").onsubmit=async e=>{e.preventDefault();
    const m=mode(),body={nom:$("nk-nom").value,contact:$("nk-contact").value,types:types(),quota:$("nk-quota").value,origines:$("nk-orig").value,notes:$("nk-notes").value,jours:$("gc-j").value,lieux:$("gc-l").checked};
    if(m==="zone"){body.zone={lat:centre.lat,lon:centre.lon,rayon:rayon(),nom:centre.nom};body.deps=depsVoulus()}else if(m==="deps")body.deps=depsVoulus();else{body.deps=[];body.zone=null}
    try{const r=await call("/admin/cles",body);$("nk-msg").textContent="Clé générée.";$("nk-out").hidden=false;$("nk-k").textContent=r.cle;
      $("nk-ex").textContent='fetch("'+base.replace(/\\/+$/,"")+'/v1/sorties?limite=50", { headers: { "X-API-Key": "'+r.cle+'" } })\\n  .then(r => r.json()).then(d => console.log(d.total, d.resultats));';
      $("nk-cp").onclick=()=>navigator.clipboard.writeText(r.cle).catch(()=>{});charger()}
    catch(err){$("nk-msg").textContent="Échec : "+err.message+"."}};
  if(base&&tok)$("cx").requestSubmit();
})();
</script>
""")

for f, (t, intro, corps) in P.items():
    with open(os.path.join(SORTIE, f), "w", encoding="utf-8") as h:
        h.write(page(f, t, intro, corps))

urls = ["", "plan-du-site.html", "mentions-legales.html", "cgu.html", "confidentialite.html", "intelligence-artificielle.html", "accessibilite.html", "integrer.html", "api.html"]
jour = dt.date.today().isoformat()
open(os.path.join(SORTIE, "sitemap.xml"), "w", encoding="utf-8").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    "".join(f"  <url><loc>{SITE}{u}</loc><lastmod>{jour}</lastmod><changefreq>{'daily' if not u else 'monthly'}</changefreq></url>\n" for u in urls) + "</urlset>\n")
open(os.path.join(SORTIE, "robots.txt"), "w", encoding="utf-8").write(f"User-agent: *\nAllow: /\nDisallow: /data/enrich/\nSitemap: {SITE}sitemap.xml\n")
print("Pages :", ", ".join(P))
