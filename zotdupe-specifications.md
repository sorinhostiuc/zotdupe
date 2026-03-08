# ZotDupe - Semantic Duplicate Detector

## Specificații tehnice complete | Plugin Zotero 7+ standalone

**Versiune document:** 1.0  
**Data:** Februarie 2026  
**Scop:** Detectarea duplicatelor semantice din biblioteca Zotero -- itemuri care reprezintă aceeași entitate bibliografică dar diferă in tip, formatare, sau metadate. General-purpose, funcționează pe orice tip de item (articole, cărți, legislație, pagini web, rapoarte etc.).

---

## 1. Problema rezolvată

Zotero nativ detectează duplicate doar pe baza DOI, ISBN sau titlu exact + an + un autor. Aceasta ratează complet:

- Aceeași lege importată ca `statute`, `webpage`, `legal_case` și `report` cu titluri ușor diferite
- Aceeași carte importată ca `book` din Amazon și ca `webpage` de pe site-ul editurii
- Același articol ca `journalArticle` (versiune finală) și `preprint` (versiune arXiv)
- Aceeași decizie judecătorească importată din surse diferite cu formate de titlu diferite
- Traduceri ale aceluiași articol (titlu in engleză vs titlu in română)
- Aceeași referință cu DOI intr-un item și fără DOI in celălalt

Plugin-ul existent Zoplicate extinde funcționalitatea nativă Zotero (bulk merge, marcare non-duplicate, alertă la import), dar folosește tot algoritmul de bază Zotero. Nu face matching semantic sau cross-type.

ZotDupe rezolvă problema cu un algoritm multi-strat care combină matching pe identificatori, normalizare de titlu, fingerprinting legislativ, matching cross-type, și scoring compozit.

---

## 2. Identificarea plugin-ului

- **Nume:** ZotDupe (Semantic Duplicate Detector)
- **Tip:** Plugin Zotero 7+ standalone (format .xpi)
- **Limbaj:** JavaScript (API intern Zotero)
- **Dependențe:** Zotero 7.x (nu necesită Word sau alt software extern)
- **Licență propusă:** GPL-3.0
- **Complementaritate:** Funcționează independent de PP2Zotero, dar poate fi folosit imediat după o conversie PP2Zotero pentru a curăța biblioteca.

---

## 3. Algoritmul de detecție in 7 straturi

Fiecare strat produce un scor de similaritate intre 0.0 și 1.0. Scorurile sunt combinate intr-un scor compozit ponderat.

### Strat 1: Identificatori exacți (pondere: 0.95)

Compară DOI, PMID, PMCID, ISBN normalizat. Dacă doi sau mai mulți itemi au același identificator exact -> scor 1.0 (match sigur).

Normalizare DOI: lowercase, eliminare prefixe (https://doi.org/, http://dx.doi.org/, doi:), trim spații.
Normalizare ISBN: eliminare cratime, spații, convertire ISBN-10 la ISBN-13.

Dacă un item are DOI și celălalt nu, dar au titlu similar -> se continuă cu straturile următoare (DOI-ul lipsă nu e motiv de excludere).

### Strat 2: Titlu normalizat + An (pondere: 0.85)

**Normalizarea titlului:**
1. Lowercase
2. Eliminare diacritice (ă->a, ș->s, ț->t, etc.) via Unicode NFKD decomposition
3. Eliminare punctuație și caractere speciale
4. Colapsare spații multiple intr-un singur spațiu
5. Eliminare articole de inceput: "the ", "a ", "an ", "un ", "o ", "la ", "le ", "les "
6. Eliminare cuvinte-zgomot juridice: "privind", "referitor la", "pentru modificarea", "cu privire la"
7. Trim

Dacă titlul normalizat este identic și anul este identic (sau diferă cu max 1 an) -> scor 0.95.
Dacă titlul normalizat este identic dar anul lipsește la un item -> scor 0.85.

### Strat 3: Autori (pondere: 0.70)

Se compară listele de autori:
- Se normalizează fiecare autor: lowercase, eliminare diacritice, doar family name
- Se calculează intersecția de family names normalizate
- Scor: |intersecție| / max(|lista_A|, |lista_B|)

Dacă un item are autori și celălalt nu -> se ignoră acest strat (nu se penalizează).

### Strat 4: Fingerprint legislativ (pondere: 0.90)

Se aplică doar itemurilor care par legislative (tip: statute, bill, hearing, regulation, legal_case, sau titlu care conține pattern-uri legislative).

**Extragerea fingerprint-ului legislativ:**

Se caută in titlu pattern-uri de forma:
- `Legea nr. NNN/AAAA` sau `Lege NNN din DATA`
- `OUG nr. NNN/AAAA` sau `Ordonanță de urgență NNN/AAAA`
- `HG nr. NNN/AAAA` sau `Hotărârea Guvernului NNN/AAAA`
- `Ordin nr. NNN/AAAA`
- `Directiva NNN/AAAA/CE` sau `Regulamentul (CE) nr. NNN/AAAA`
- `Decizia nr. NNN/AAAA` (ICCJ, CCR)

Fingerprint-ul = tuplu (TIP_ACT, NUMAR, AN). Ex: ("LEGE", "104", "2003").

Dacă două itemuri au același fingerprint legislativ -> scor 0.95 (match quasi-sigur, indiferent de titlul complet sau tipul de item).

Regex-uri principale:

```javascript
const LEGAL_PATTERNS = [
  /(?:legea?|lege)\s*(?:nr\.?\s*)?(\d+)\s*[\/din]+\s*(\d{4})/i,
  /(?:oug|ordonan[tț][aă]\s+de\s+urgen[tț][aă])\s*(?:nr\.?\s*)?(\d+)\s*[\/din]+\s*(\d{4})/i,
  /(?:hg|hot[aă]r[aâ]rea?\s+guvernului)\s*(?:nr\.?\s*)?(\d+)\s*[\/din]+\s*(\d{4})/i,
  /(?:ordin|ordinul)\s*(?:nr\.?\s*)?(\d+)\s*[\/din]+\s*(\d{4})/i,
  /(?:directiva?)\s*(?:nr\.?\s*)?(\d+)\s*\/\s*(\d+)\s*\/?\s*(?:ce|ue|cee)?/i,
  /(?:regulamentul?)\s*\(?\s*(?:ce|ue|cee)?\s*\)?\s*(?:nr\.?\s*)?(\d+)\s*\/\s*(\d{4})/i,
  /(?:decizia?)\s*(?:nr\.?\s*)?(\d+)\s*[\/din]+\s*(\d{4})/i
];
```

### Strat 5: URL / Access Number (pondere: 0.75)

Se compară URL-urile normalizate (eliminare protocol, www, trailing slash, parametri query).
Se compară access numbers, call numbers, archive IDs.

Dacă URL-urile pointează la același domeniu + path -> scor 0.80.
Dacă sunt identice -> scor 0.95.

### Strat 6: Preprint <-> Journal Article (pondere: 0.85)

Detectează perechile preprint/articol final:
- Un item e de tip `preprint` și celălalt `journalArticle`
- Sau un item are URL arXiv/bioRxiv/medRxiv/SSRN și celălalt e articol de jurnal
- Se compară titlul (normalizat, threshold Jaccard >= 0.80) + primul autor
- Se verifică dacă DOI-ul arXiv mapează la DOI-ul articolului (via CrossRef)

### Strat 7: Traduceri (pondere: 0.60)

Detectează potențiale traduceri:
- Limbile diferă (câmpul `language` diferă)
- Autori identici
- An identic
- Jurnal/publisher similar

Scor maxim: 0.70 (necesită confirmare manuală).

---

## 4. Scorul compozit și pragurile de decizie

Formula scorului compozit:

```
scor_final = max(
  scor_strat1 * 0.95,
  scor_strat4 * 0.90,
  (scor_strat2 * 0.50 + scor_strat3 * 0.25 + scor_strat5 * 0.15 + scor_strat6 * 0.10) * factor_normalizare,
  scor_strat6_preprint * 0.85,
  scor_strat7_traducere * 0.60
)
```

Se ia maximul deoarece un singur strat cu scor inalt (ex: DOI identic) este suficient pentru a confirma un duplicat.

**Praguri de decizie:**

| Scor final | Clasificare | Acțiune implicită |
|-----------|------------|-------------------|
| >= 0.95 | Duplicat sigur | Auto-merge propus (cu confirmare) |
| 0.80 - 0.94 | Duplicat probabil | Semnalare + merge propus |
| 0.60 - 0.79 | Posibil duplicat | Semnalare (necesită decizie manuală) |
| < 0.60 | Nu e duplicat | Ignorat |

---

## 5. Optimizare de performanță

### 5.1 Strategia de blocking

Pentru o bibliotecă de N itemuri, compararea tuturor perechilor este O(N^2), inacceptabil pentru N > 5000.

**Blocking:** Se grupează itemurile in "blocuri" pe baza unor chei de blocking. Doar itemurile din același bloc sunt comparate intre ele.

Chei de blocking folosite (un item poate fi in mai multe blocuri):
1. DOI normalizat (dacă există)
2. ISBN normalizat (dacă există)
3. Primele 3 cuvinte semnificative din titlu normalizat + anul
4. Fingerprint legislativ (dacă se detectează)
5. Primul autor family name + anul

Un item cu DOI, titlu "Machine learning in forensic pathology" din 2023 de Smith va fi in blocurile: {"doi:10.xxxx", "machine learning forensic+2023", "smith+2023"}.

**Rezultat:** Reduce comparările de la O(N^2) la O(N * k) unde k << N (de obicei k < 20).

### 5.2 MinHash LSH (opțional, pentru biblioteci > 20.000 itemi)

Pentru titluri, se poate folosi MinHash Locality-Sensitive Hashing:
1. Se calculează un set de shingles (3-grame de caractere) din titlul normalizat
2. Se calculează semnătura MinHash (128 hash-uri)
3. Se aplică banding LSH (b=16 bands, r=8 rows)
4. Doar perechile candidate (cel puțin o bandă identică) sunt comparate complet

Aceasta adaugă complexitate de implementare dar permite scanarea bibliotecilor de 100.000+ itemi in sub 30 secunde.

---

## 6. Gestionarea merge-ului cross-type

### 6.1 Problema: Zotero nu permite merge intre tipuri diferite

Zotero nativ blochează merge-ul intre itemuri de tipuri diferite (ex: journalArticle + webpage). Aceasta este o limitare documentată (GitHub issue #1393). Zoplicate oferă opțiunea "force type of master" dar doar pentru itemuri deja in lista de duplicate Zotero.

### 6.2 Soluția ZotDupe: Change Type -> Merge

ZotDupe va:
1. Determina itemul canonical (cel mai complet, vezi secțiunea 7)
2. Schimba tipul itemurilor non-canonice pentru a se potrivi cu tipul canonical (via `item.itemType = "journalArticle"`)
3. Executa merge-ul (via Zotero API: `Zotero.Items.merge(masterItem, [duplicateItems])`)

**Avertizare:** La schimbarea tipului, câmpurile care nu există in noul tip se pierd. ZotDupe salvează aceste câmpuri in câmpul `Extra` al itemului inainte de schimbarea tipului, cu formatul:

```
[ZotDupe:preserved] originalType: webpage
[ZotDupe:preserved] websiteTitle: Legislatie.just.ro
[ZotDupe:preserved] websiteType: Portal juridic
```

---

## 7. Selecția itemului canonical

Când un cluster de duplicate este identificat, ZotDupe trebuie să aleagă care item devine "masterul" (itemul reținut). Criterii, in ordine de prioritate:

1. **Tipul cel mai potrivit:** journalArticle > preprint > book > bookSection > conferencePaper > report > thesis > statute > webpage > document. (Legislația: statute > bill > regulation > webpage.)

2. **Completitudinea metadatelor:** Se numără câmpurile non-goale. Itemul cu cele mai multe câmpuri completate câștigă.

3. **Prezența DOI:** Itemul cu DOI câștigă.

4. **Prezența PDF-ului atașat:** Itemul cu PDF câștigă.

5. **Data adăugării:** La egalitate, itemul adăugat cel mai devreme câștigă (este probabil cel cu care utilizatorul a lucrat cel mai mult).

Utilizatorul poate suprascrie selecția.

---

## 8. Regulile de merge a câmpurilor

La merge, pentru fiecare câmp:
- Dacă masterul are valoare și duplicatul nu -> se păstrează valoarea masterului
- Dacă masterul nu are valoare dar duplicatul da -> se copiază valoarea duplicatului
- Dacă ambii au valoare -> se păstrează valoarea masterului (dar duplicatul este menționat in logul de merge)

Excepții:
- **Tags:** Se face reuniunea tuturor tagurilor
- **Collections:** Itemul merge apare in toate colecțiile in care apărea oricare din duplicate
- **Attachments:** Se păstrează toate atașamentele unice (PDF-uri diferite)
- **Notes:** Se păstrează toate notele
- **Related items:** Se face reuniunea
- **Extra field:** Se concatenează conținutul unic

---

## 9. Descriere detaliată a interfaței (mockup textual)

Tema vizuală: **light mode**. Fundal: alb (#FFFFFF) pentru conținut, gri foarte deschis (#F7F7F8) pentru bare și panouri. Text principal: gri inchis (#1A1A1A). Accent primar: mov-albastru (#5C6BC0, evocând ZotDupe ca identitate distinctă de PP2Zotero). Accent secundar: verde (#388E3C) pentru succes, amber (#FF8F00) pentru atenționări, roșu (#D32F2F) pentru conflicte. Font: nativ OS. Dimensiune: 13px conținut, 11px etichete, 16px titluri.

---

### Ecranul 1 -- Configurare scanare

**Layout:** Fereastră dialog 560x420px. Bară de titlu: "ZotDupe -- Semantic Duplicate Detector".

**Header:**
Logo mic (48x48px, icon mov-albastru cu textul "ZD" in alb) + textul "ZotDupe" bold 18px + sub el "Semantic Duplicate Detector" gri 11px italic + "v1.0.0" gri 10px monospace.

**Secțiunea "Scanează biblioteca":**
Label bold 14px: "Ce să scanez?"

Două radio buttons:
- (o) Intreaga bibliotecă (N itemi)
- ( ) Doar colecția: [dropdown cu colecțiile Zotero]

**Secțiunea "Setări de matching":**
Label bold 14px: "Sensibilitatea detecției"

Un slider orizontal cu 3 poziții:
- Stânga: "Strict" (doar match-uri cu scor >= 0.90, mai puține false positive-uri)
- Centru: "Balansat" (scor >= 0.75, implicit)
- Dreapta: "Relaxat" (scor >= 0.60, mai puține false negative-uri, mai multe de verificat manual)

Sub slider: text gri 11px care se actualizează: "Pragul curent: >= 0.75 -- Va detecta duplicate probabile și sigure."

**Secțiunea "Opțiuni avansate" (expandabilă, implicit collapsed):**

Cinci checkbox-uri:
1. [x] Activează fingerprinting legislativ (detectare legi, OUG, HG, directive EU) -- implicit activat
2. [x] Detectează perechi preprint/articol final -- implicit activat
3. [ ] Detectează traduceri (titluri in limbi diferite, aceiași autori) -- implicit dezactivat (rata de false positive-uri mai mare)
4. [x] Compară cross-type (ex: webpage vs statute, book vs webpage) -- implicit activat
5. [ ] Folosește MinHash LSH (recomandat pentru biblioteci > 20.000 itemi) -- implicit dezactivat

**Zona inferioară:**
Text gri mic: "Durata estimată: ~5 secunde pentru 2.000 itemi, ~30 secunde pentru 20.000 itemi"
Butoane: "Anulează" (secundar) și "Scanează" (primar, fundal mov-albastru #5C6BC0, text alb).

---

### Ecranul 2 -- Rezultate: lista de clustere

**Layout:** Fereastra se mărește la 880x650px.

**Bară de statistici (sus, 56px):**
Fundal gri deschis (#F0F0F5), 5 carduri statistice orizontale:
1. "1.847" / "ITEMI SCANAȚI" -- negru
2. "23" / "CLUSTERE DUPLICATE" -- mov-albastru #5C6BC0
3. "14" / "SIGURE (>= 0.95)" -- verde #388E3C
4. "6" / "PROBABILE (0.80-0.94)" -- amber #FF8F00
5. "3" / "POSIBILE (0.60-0.79)" -- roșu deschis #EF5350

**Bara de filtrare (sub statistici):**
Două toggle buttons (chip-uri):
- [Toate: 23] [Sigure: 14] [Probabile: 6] [Posibile: 3]
- Și un câmp de căutare text: "Caută in clustere..."

**Lista de clustere (zona principală, scrollabilă):**

Fiecare cluster este un card (lățime 100%, margine verticală 8px, border gri #E0E0E0, border-radius 8px, border-left: 4px solid [culoare in funcție de scor: verde/amber/roșu]).

Structura unui card de cluster:

**Antetul cardului (40px, fundal gri foarte ușor #FAFAFA):**
- Stânga: "Cluster #1" bold 12px gri + badge scor: ex "0.97" in cerculeț verde (fundal verde deschis, text verde inchis, 10px bold)
- Centru: tip de match detectat: "DOI identic" sau "Fingerprint legislativ" sau "Titlu similar + autori" -- text gri 11px italic
- Dreapta: badge cu numărul de itemi: "3 itemi" in gri

**Corpul cardului:** Lista itemurilor din cluster, fiecare pe un rând:

Un rând de item conține:
- Radio button pentru selecția itemului canonical (cel preselectat de ZotDupe are un label "(recomandat)" gri mic lângă el)
- Iconița tipului de item (folosind icoanele native Zotero: articol, carte, webpage, statute etc.) -- 16x16px
- Titlul in bold 12px negru (max 2 linii, truncat cu "...")
- Autori in gri 11px sub titlu
- An in monospace 11px
- Tipul de item in badge gri deschis rotunjit (ex: "journalArticle", "webpage", "statute") -- 10px
- Dacă are DOI: iconița DOI albastru mic
- Dacă are PDF: iconița PDF roșu mic

Exemplu vizual (in text) pentru Cluster #1:

```
┌─ Cluster #1 ─────────────────────────────── [0.97] DOI identic ── 2 itemi ─┐
│                                                                              │
│  (o) [icon:article] "Machine learning in forensic anthropology: a review"    │
│      (RECOMANDAT)   Smith J, Jones A, et al. | 2023 | [journalArticle]      │
│                     DOI: 10.1016/j.forsci... | [PDF]                         │
│                                                                              │
│  ( ) [icon:preprint] "Machine Learning in Forensic Anthropology - A Review"  │
│                      Smith J, Jones A, et al. | 2023 | [preprint]            │
│                      arXiv:2303.12345                                        │
│                                                                              │
│  Acțiuni: [Merge] [Marchează ca non-duplicate] [Detaliază diferențe]         │
└──────────────────────────────────────────────────────────────────────────────┘
```

Alt exemplu -- Cluster legislativ (#7):

```
┌─ Cluster #7 ──────────────── [0.96] Fingerprint: LEGE 104/2003 ── 4 itemi ─┐
│                                                                              │
│  (o) [icon:statute] "Legea nr. 104/2003 privind manipularea cadavrelor      │
│      (RECOMANDAT)    umane si prelevarea organelor"                           │
│                      Parlamentul Romaniei | 2003 | [statute]                 │
│                                                                              │
│  ( ) [icon:webpage] "Lege 104 din 25 aprilie 2003 privind manipularea       │
│                      cadavrelor umane si prelevarea organelor si             │
│                      tesuturilor de la cadavre"                               │
│                      | 2003 | [webpage] | URL: legislatie.just.ro            │
│                                                                              │
│  ( ) [icon:case]    "L. 104/2003 M.Of. 476/2003"                            │
│                      | 2003 | [legal_case]                                   │
│                                                                              │
│  ( ) [icon:report]  "Romanian Law 104/2003 on handling of human corpses"     │
│                      | 2003 | [report] | language: en                        │
│                                                                              │
│  Acțiuni: [Merge in itemul canonical] [Non-duplicate] [Detaliază]            │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Butonul de acțiuni pentru fiecare cluster:**

Trei butoane mici la baza cardului:
1. "Merge" (fundal mov-albastru, text alb) -- execută merge-ul in itemul canonical selectat
2. "Non-duplicate" (border gri, text gri) -- marchează perechea ca non-duplicat (se salvează in relații Zotero)
3. "Detaliază diferențe" (border gri, text gri) -- deschide Ecranul 3

**Bara inferioară (60px):**
Stânga: "Clustere rezolvate: 0/23"
Dreapta: "Merge automat toate sigure (14)" (buton secundar cu border verde) și "Inchide" (buton primar).

---

### Ecranul 3 -- Preview merge (detalii diferențe)

**Layout:** Panel lateral sau fereastră secundară, 700x550px.

**Header:** "Merge Preview -- Cluster #7" bold 14px.

**Zona superioară:** Vizualizare side-by-side a câmpurilor, similar cu un diff:

Tabel cu 3 coloane:
- Coloana 1: "Câmp" (120px, text bold gri 11px)
- Coloana 2: "Itemul canonical (MASTER)" (flex, cu header verde)
- Coloana 3: "Itemul 2 / Itemul 3 / ..." (flex, cu header gri)

Pentru fiecare câmp:
- Dacă sunt identice: fundal alb, text normal
- Dacă diferă: fundal galben deschis (#FFF8E1), cu opțiunea de a alege care valoare se păstrează (click pe celulă pentru a selecta)
- Dacă un câmp lipsește la master dar există la duplicat: fundal albastru deschis (#E3F2FD) cu iconița "+" -- se va copia la merge

Exemplu:

```
┌──────────────┬─────────────────────────────┬──────────────────────────────┐
│ Camp         │ MASTER (statute)            │ Duplicat 1 (webpage)         │
├──────────────┼─────────────────────────────┼──────────────────────────────┤
│ Titlu        │ Legea nr. 104/2003 privind  │ Lege 104 din 25 aprilie 2003│
│              │ manipularea cadavrelor...   │ privind manipularea...       │
│              │ [PASTRAT]                   │                              │
├──────────────┼─────────────────────────────┼──────────────────────────────┤
│ Tip item     │ statute                     │ webpage (se va schimba)      │
├──────────────┼─────────────────────────────┼──────────────────────────────┤
│ URL          │ (lipseste)                  │ legislatie.just.ro/...       │
│              │ [+ SE VA COPIA]             │                              │
├──────────────┼─────────────────────────────┼──────────────────────────────┤
│ Tags         │ legislatie, drept-penal     │ legislatie, romania          │
│              │ -> REUNIUNE: legislatie,    │                              │
│              │    drept-penal, romania     │                              │
├──────────────┼─────────────────────────────┼──────────────────────────────┤
│ Attachments  │ [PDF] lege_104_2003.pdf     │ (niciun atasament)           │
│              │ [PASTRAT]                   │                              │
└──────────────┴─────────────────────────────┴──────────────────────────────┘
```

**Zona inferioară:**
Text amber mic: "Atenție: Itemul 2 (webpage) va fi schimbat la tipul 'statute' inainte de merge. Câmpurile 'websiteTitle' și 'websiteType' vor fi salvate in câmpul Extra."

Butoane: "Anulează" (secundar) și "Execută merge" (primar, mov-albastru).

---

### Ecranul 4 -- Raport final

**Layout:** 560x500px.

**Header:** Iconița check mare verde + "Scanare completată" bold 18px verde.

**Card sumar:**

Rânduri cheie-valoare:
- "Itemi scanați" -> "1.847"
- "Clustere detectate" -> "23"
- --- separator ---
- "Merge-uri executate" -> "18" (verde)
- "Marcate ca non-duplicate" -> "3" (gri)
- "Nerezolvate (skip)" -> "2" (amber)
- --- separator ---
- "Câmpuri salvate in Extra" -> "7" (albastru)
- "Atașamente păstrate" -> "24"
- "Tags reunite" -> "31 tag-uri unice"
- --- separator ---
- "Timp scanare" -> "4.2s"
- "Timp merge total" -> "8.7s"

**Sub card:**
Buton "Exportă raport CSV" (secundar) -- generează un CSV cu toate clusterele, itemurile, scorurile, acțiunile.

Buton "Inchide" (primar).

---

## 10. Structura fișierelor plugin-ului

```
zotdupe/
  manifest.json                 // metadata plugin Zotero 7+
  bootstrap.js                  // entry point
  src/
    scanner.js                  // Strat 1-7 matching engine
    blocker.js                  // Blocking strategy
    scorer.js                   // Scor compozit
    merger.js                   // Cross-type merge logic
    canonical.js                // Selectia itemului canonical
    legal-fingerprint.js        // Parser regex legislativ
    ui/
      config-dialog.html        // Ecran 1
      config-dialog.js
      results-panel.html        // Ecran 2
      results-panel.js
      merge-preview.html        // Ecran 3
      merge-preview.js
      report-dialog.html        // Ecran 4
      report-dialog.js
    utils/
      normalize.js              // Normalizare titlu, autori, DOI
      minhash.js                // MinHash LSH (opțional)
  locale/
    en-US/
    ro-RO/
  prefs.js                      // Setări persistente
```

---

## 11. Estimare efort de dezvoltare

| Componentă | Complexitate | Zile-om |
|------------|-------------|---------|
| Scanner: Straturi 1-3 (identificatori + titlu + autori) | Medie | 5-7 |
| Scanner: Strat 4 (fingerprint legislativ) | Medie | 3-5 |
| Scanner: Straturi 5-7 (URL, preprint, traduceri) | Medie | 4-6 |
| Blocking + performanță | Medie-mare | 4-6 |
| MinHash LSH (opțional) | Mare | 5-8 |
| Scoring compozit + praguri | Mică-medie | 2-3 |
| Merge cross-type + salvare câmpuri | Mare | 6-8 |
| Selecție canonical | Mică | 2-3 |
| UI: 4 ecrane | Mare | 8-12 |
| Testare și debugging | Mare | 8-12 |
| Documentație și packaging | Mică | 2-3 |
| **Total** | | **~50-70** |

---

## 12. Faze de implementare

**Faza 1 (MVP):** Straturi 1-3 (DOI + titlu + autori) + blocking simplu + UI minimalist (lista clustere + merge) + merge doar same-type.

**Faza 2:** Strat 4 (fingerprint legislativ) + merge cross-type cu salvare câmpuri in Extra + UI tabelar complet.

**Faza 3:** Straturi 5-6 (URL, preprint) + selecție canonical automată + raport CSV + marcare non-duplicate.

**Faza 4:** Strat 7 (traduceri) + MinHash LSH + merge preview side-by-side + optimizare performanță pentru 100k+ itemi.

---

## 13. Diferențe față de Zoplicate

| Funcționalitate | Zotero nativ | Zoplicate | ZotDupe |
|----------------|-------------|-----------|---------|
| Matching DOI/ISBN/titlu exact | Da | Da (folosește algoritmul Zotero) | Da + normalizare avansată |
| Matching fuzzy titlu | Nu | Nu | Da (Levenshtein/Jaccard, threshold configurabil) |
| Matching cross-type | Nu | Opțiune "force type" | Da (merge inteligent cu salvare câmpuri) |
| Fingerprinting legislativ | Nu | Nu | Da |
| Detecție preprint/articol | Nu | Nu | Da |
| Detecție traduceri | Nu | Nu | Da |
| Marcare non-duplicate | Nu | Da | Da |
| Bulk merge | Nu | Da | Da + auto-merge sigure |
| Alertă la import | Nu | Da | Nu (focus pe scanare bibliotecă, nu pe import) |
| Scor de similaritate | Nu | Nu | Da (0.0-1.0, configurabil) |
| Raport CSV | Nu | Nu | Da |
