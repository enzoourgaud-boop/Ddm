# À vérifier par le professeur

> **Relu par le professeur le 12/11/2026.** Tout est validé (☑), sauf 3 questions désactivées (⛔) : `cult-petalos-guian`, `cult-calaveritas-azucar`, `cult-nombre-ofrenda`. Elles restent dans `cultura.json` avec `"disabled": true` et ne sont plus posées.

Ce fichier liste tout ce qui, dans le jeu, **ne vient pas directement de tes documents** (`sources/`). Pour chaque point, trois options :
- **valider** : coche la case ;
- **corriger** : modifie la question dans `content/sequences/dia-de-muertos/questions/…json` ;
- **désactiver** : ajoute `"disabled": true` à la question (l'espace professeur de l'étape 5 le fera en un clic).

Les identifiants (`cult-alebrije`…) permettent de retrouver chaque question dans les fichiers JSON.

## 1. Questions de culture hors documents

| ✔ | Identifiant | Question | Réponse attendue | D'où ça vient |
|---|---|---|---|---|
| ⛔ désactivée | `cult-petalos-guian` | Según la tradición, ¿para qué sirven los pétalos de cempasúchil? | Para guiar a las almas | Prototype. Tes documents disent seulement qu'on décore les tombes avec ces fleurs. |
| ☑ | `cult-alebrije` | ¿Qué es un alebrije? | Una criatura fantástica de muchos colores | Prototype. L'image de la fiche « elementos » montre un alebrije, mais aucune définition n'est donnée. |
| ⛔ désactivée | `cult-calaveritas-azucar` | ¿De qué están hechas las calaveritas tradicionales? | De azúcar | Déduit de l'image (tête de mort en sucre) de la fiche « elementos ». |
| ☑ | `cult-pelicula` | ¿Cómo se llama la película de Pixar sobre el Día de Muertos? | Coco | Ton document de description d'affiche nomme le film. L'explication ajoute la date (2017), qui n'est pas dans tes documents. Le jeu n'affiche aucune image du film. |
| ☑ | `cult-color-cempasuchil` | ¿De qué color es la flor de cempasúchil? | Naranja | Déduit des images (fiche « elementos » et autel du court-métrage). |
| ⛔ désactivée | `cult-nombre-ofrenda` | ¿Cómo se llama el altar con fotos, velas, flores y comida? | La ofrenda | Le mot « ofrenda » vient de la transcription (`contenu-sequence.md`, « el altar / la ofrenda »), pas d'un texte de cours. |

## 2. Vocabulaire déduit ou ajouté

La fiche « Los elementos del Día de Muertos » ne donne que des images. Les mots ci-dessous sont ceux de la transcription (`contenu-sequence.md`), **à confirmer** :
- ☑ la calavera, la flor (de cempasúchil), el pan de muerto, la vela, el altar / la ofrenda, la cruz, el cementerio, la tumba, el esqueleto, la guitarra, la trompeta, el tambor (pour l'image « instruments de musique »).
- ☑ `voc-mariposa-*` : **la mariposa** (le papillon) vient du prototype, pas de tes documents.
- ☑ Mots tirés de l'affiche décrite (`cartel-descripcion`) : el niño, el hombre, la mujer, la ciudad, el vestido, volar, llevar.

## 3. Phrases d'exemple inventées

Les phrases des questions de conjugaison et de grammaire (« Mi hermano está leyendo un cuento de miedo », « La foto está en el centro del altar »…) sont des **exemples fabriqués** à partir des règles de tes fiches. Elles ne contiennent pas d'affirmation culturelle. À noter toutefois :
- ☑ `conj-frase-tu-escribiendo` : « Tú estás escribiendo una calaverita ». Le mot *calaverita* au sens de « petit poème » (*calaverita literaria*) n'apparaît pas dans tes documents.
- ☑ `gram-centro-hay-esta` : l'explication introduit la nuance « HAY + un/una, ESTAR + el/la ». Elle va au-delà de ta fiche, qui dit seulement « hay = il y a ; ESTAR para situar ».

## 4. Noms et éléments du décor du jeu

Ces noms ne sont pas posés en question. Ils servent d'habillage, mais les élèves les verront :

| ✔ | Élément | Où dans le jeu | Remarque |
|---|---|---|---|
| ☑ | **El Mictlán** | nom de l'acte 3 | Inframonde de la mythologie aztèque. Absent de tes documents. |
| ☑ | **Mictlantecuhtli** | jefe de l'acte 2 | Seigneur du Mictlán dans la mythologie aztèque. Absent de tes documents. |
| ☑ | **El Panteón** | nom de l'acte 2 | Au Mexique, « panteón » désigne couramment le cimetière. |
| ☑ | **El Xoloitzcuintle** | ennemi de l'acte 2 | Race de chien mexicaine. Absente de tes documents. |
| ☑ | **El Tianguis** | boutique entre les actes | Marché traditionnel mexicain. Absent de tes documents. |
| ☑ | **La Lechuza**, **El Jaguar de Obsidiana**, **La Serpiente**, **La Mariposa Negra** | ennemis | Créatures choisies pour l'ambiance, sans affirmation culturelle. |
| ☑ | **Papel picado**, **cartes de lotería** | décor (guirlande, cartes des ennemis) | Motifs traditionnels mexicains. Absents de tes documents. |
| ☑ | **El Mariachi de Huesos** | élite de l'acte 2 | « Mariachi » apparaît dans un distracteur, jamais comme bonne réponse. |
| ☑ | **Tamales**, **Chocolate** | objets de soin | Plats mexicains. Absents de tes documents. |

## 5. Ce qui vient bien de tes documents (pour mémoire)

Texte de compréhension (dates, origine maya et aztèque, États-Unis, fête de bienvenue, adjectifs, musique et danse) ; P2 (cimetières, prières, offrandes, déguisements) ; P3 (la Catrina, Posada, critique, déguisement) ; fiche ESTAR + GERUNDIO (toutes les formes et règles) ; outils de description d'image (izquierda, derecha, planos, hay, ser/estar, yo veo / podemos ver).

## 6. Ajouts de l'étape 2 (à relire)

### Événements (`content/sequences/dia-de-muertos/events.json`)
Ce sont 13 petites scènes **inventées** en espagnol A1, sans affirmation culturelle nouvelle. Relis surtout la langue et le niveau :
- ☐ `abuela-tamales` : une grand-mère prépare des tamales (plat déjà présent comme objet de soin).
- ☐ `musico-baile`, `banda-esqueletos` : musiciens et squelettes qui jouent de la trompette, du tambour, des maracas.
- ☐ `altar-sin-velas`, `foto-ofrenda` : un autel avec la photo d'un défunt (doc1, fiche « elementos »).
- ☐ `tumba-flores` : une famille décore une tombe avec des fleurs de cempasúchil (P2).
- ☐ `ninos-disfrazados` : des enfants déguisés en squelettes dans la rue (P2).
- ☐ `panaderia` : une boulangerie vend du pain de muerto.
- ☐ `loteria-plaza` : des gens jouent à la lotería sur la place (jeu de société mexicain, décor déjà validé).
- ☐ `alebrije-trato`, `calavera-pregunta`, `mariposas`, `vendedor-esqueleto` : scènes fantastiques, sans affirmation culturelle.

### Nouveaux objets (`items.json`)
- ☐ Incienso (aide), Pan de muerto, Trompeta, Diccionario de bolsillo, Mapa de pétalos, Pluma de colibrí, Reloj de sol, Máscara, Calavera de la suerte, Lotería (reliques). Ce sont des noms d'objets, sans affirmation culturelle.
- ☐ Ensemble « Ofrenda completa » (Vela + Cempasúchil + Pan de muerto) : il associe trois éléments de l'ofrenda vus en classe.
- ☐ Ensemble « Mariachi » (Maracas + Trompeta) : le mot apparaissait déjà dans le décor validé.

## 7. Ajouts de l'étape 3 (à relire)

### Vrai / faux (`questions/vrai-faux.json`, 36 affirmations)
Toutes viennent de tes documents (texte, P2, P3, fiche ESTAR + GERUNDIO, outils de description). Les affirmations fausses sont fabriquées pour être réfutées. Exemples : « La Catrina fue creada por Frida Kahlo » (falso) ; « Los disfraces típicos son princesas y piratas » (falso).
- ☐ Vérifie que chaque affirmation **vraie** est bien formulée comme dans tes documents.

### Compréhension orale (`questions/ecoute.json`, 30 questions)
- ☐ Les distracteurs « qui sonnent pareil » sont des mots **hors séquence**, choisis pour leur son (la cara, la caravana, la cadena, la bella, la tuba, la rumba, el escritorio, el delfín, la oferta, la merienda, el silencio, la avenida, el comentario, la maraca, la posada…). Ils ne sont jamais la bonne réponse.
- ☐ Les 6 questions orales de culture reprennent les questions de compréhension du texte (P4).

### Scènes (`scenes.json`, `questions/escenas.json`)
- ☐ Deux décors originaux : **une ofrenda à deux étages** (arriba / abajo × a la izquierda / en el centro / a la derecha) et **un cimetière en trois plans** (en el fondo / en segundo plano / en primer plano). Aucune image du court-métrage ni de l'affiche.
- ☐ Objets placés : vela, foto, calavera, flor, pan de muerto, frutas, cruz, tumba, esqueleto, guitarra, alebrije, mariposa, niño, mujer.
- ☐ Pour « Place les objets », les consignes mélangent « X está arriba, a la izquierda » (ESTAR + el/la) et « En el fondo, a la derecha, hay una cruz » (HAY + un/una), comme dans ta fiche de description.

### Associer mot et image (`questions/association.json`)
- ☐ Images (emoji) discutables à vérifier : ✏️ pour « el caricaturista », 🎭 pour « el disfraz », 🕊️ pour « volar », 😐 pour « serio ».

### Remettre dans l'ordre (`questions/ordre.json`, 24 phrases)
- ☐ Phrases reprises du texte, de P2, de P3, de la fiche ESTAR + GERUNDIO et des outils de description. Certaines contiennent une étiquette piège (ex. « leiendo » à côté de « leyendo »).

## 8. Ajouts de l'étape 4 (à relire)

### Cartes de lotería (`enemies.json` et `items.json`, champ `phrase`)
Chaque carte porte une petite phrase d'exemple en espagnol, inventée avec le vocabulaire de la séquence (« La vela está en el altar », « El esqueleto está tocando la trompeta », « La Catrina lleva un sombrero »…).
- ☐ Relis les 42 phrases : niveau A1-A2, sans affirmation culturelle nouvelle.

### Personnages (`sequence.json`, rubrique `characters`)
- ☐ Valentina (la ofrendera), Mateo (el trompetista), Luz (la poeta). La description de Luz parle de « vers pour les défunts », une allusion aux *calaveritas literarias* (validée à l'étape 1).
