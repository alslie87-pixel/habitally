# HabiTally — sjekkliste før salg

Status: teknisk rebrand ferdig. Dette er hva som gjenstår før produktet kan selges til fremmede.

Merk hver linje: OK / FIKS / DROPP.

---

## 1. Sikkerhet

### 1.1 Tilgangsmodellen — blokkerende
`?user=navn` er ikke innlogging. Gjetter noen et navn, får de full lese- og skrivetilgang til det arket.

For to roomies er dette greit. For betalende kunder er det ikke det.

Tre nivåer, velg ett:
- **Token i lenken.** Legg til en `token`-kolonne i Customers (tilfeldig 16-tegns streng). Lenken blir `?user=navn&t=abc123`. `_user.js` krever at token matcher. Ingen innlogging for brukeren, men lenken kan ikke gjettes. ~1 times arbeid.
- **Magic link.** Samme som over, men token utløper og fornyes per e-post.
- **Ekte auth** (Google-innlogging). Riktig på sikt, betydelig arbeid.

Anbefaling: token nå, auth senere hvis produktet selger.

### 1.2 Input-validering i API-ene
`toggle-habit` tar `sheetName`, `row`, `col` rett fra klienten og skriver til arket.

Sjekk i `api/toggle-habit.js`:
- Valideres `row` og `col` som tall innenfor forventet område?
- Valideres `sheetName` mot en hviteliste (månedsnavnene)?
- Kan noen skrive utenfor rutenettet, f.eks. inn i Control Panel?

Samme spørsmål for `update-config.js` og `update-focus.js`.

### 1.3 Rate limiting på coaching
`/api/get-coaching` koster deg penger per kall. Ingenting hindrer noen i å kalle den i loop.

- Ligger det noen begrensning der i dag?
- Minimum: maks X kall per bruker per dag, lagret i arket eller i minnet.

### 1.4 Service-kontoens rekkevidde
Service-kontoen har skrivetilgang til alle kundeark.

- Hvilke scopes brukes faktisk? `spreadsheets` overalt, eller `spreadsheets.readonly` der det holder?
- Ligger `GOOGLE_SERVICE_ACCOUNT` kun i Vercel, aldri i repoet? (Sjekk git-historikken, ikke bare nåværende filer.)

### 1.5 CORS og åpne endepunkter
- Kan API-ene kalles fra andre domener?
- Er det noe endepunkt som returnerer en liste over alle brukere eller alle ark?

---

## 2. Korrekthet

### 2.1 Årsskifte — blokkerende før nyttår
`getDailyQuote()` i `index.html` har `new Date(2026, 0, 1)` hardkodet. Etter nyttår gir den negative tall.

Andre steder å sjekke:
- Månedsfanene: hva skjer 1. januar? Finnes fanene for neste år, eller må arket kopieres på nytt?
- Streak over nyttår: brytes den 31. desember?
- `get-stats` batchGet over 12 månedsfaner — antar den ett kalenderår?

Bestem hva som er riktig oppførsel: nullstilles året, eller ruller det videre? Dette er en produktbeslutning, ikke bare kode.

### 2.2 Streak- og prosentlogikk
- Teller streak dager der brukeren ikke krysset noe i det hele tatt som brudd?
- Hva skjer hvis brukeren fyller inn bakover i tid?
- Er "this week" mandag–søndag konsekvent i både app og ark?

### 2.3 Tidssone
Vercel kjører UTC. Du er i Oslo (UTC+1/+2).

- Mellom 00:00 og 02:00 norsk tid: hvilken dag regner serveren som "i dag"?
- Klienten bruker `new Date()` lokalt, serveren sannsynligvis UTC. Er de enige?

Dette gir subtile feil som ser ut som "appen mistet krysset mitt".

### 2.4 Tomme og nye ark
- Hva viser appen for en bruker som ikke har krysset noe ennå? (Du så "0 / 0%" — er det riktig, eller bør det være en velkomsttilstand?)
- Hva skjer hvis Control Panel har færre enn 3 gode eller 3 dårlige vaner?
- Hva hvis brukeren sletter en månedsfane?

### 2.5 Feilhåndtering
- Hva ser brukeren hvis Google Sheets API er nede eller kvoten er brukt opp?
- Dagens feilmelding sier "Make sure your Google Sheet is shared with the service account" — det er en utviklermelding, ikke en brukermelding.

---

## 3. Innhold og tekst

### 3.1 Språk
Appen er engelsk ("day streak", "Avoid", "Build", "Needs work"), arket er engelsk, e-posten er norsk.

Velg ett. Selger du i Norge: norsk hele veien. Selger du bredere: engelsk hele veien.
Halvveis er det som ser mest amatørmessig ut.

### 3.2 Påstander som ikke holder
Gå gjennom all tekst i app, ark og Guide og fjern det som ikke er sant:

- "30 dager danner en vane" — myten stammer fra en plastikkirurg på 60-tallet. Forskningen (Lally et al., 2009) fant median 66 dager, med enormt spenn (18–254). Du bruker 30 som mål flere steder. Det er greit som mål, ikke som påstand.
- "Day 21. This is real change." — samme problem.
- "Your brain is rewiring" — overselger.
- Sitatene: flere er tilskrevet feil person. "We are what we repeatedly do" er Will Durant som parafraserer Aristoteles, ikke Aristoteles. Sjekk hver enkelt, eller merk dem som "ofte tilskrevet".

Dette betyr noe kommersielt: én kunde som oppdager en åpenbar feil, mistror resten.

### 3.3 Guide-fanen
- Beskriver den appen slik den faktisk er nå, etter alle endringene?
- Nevner den funksjoner som ikke finnes, eller mangler den nye?

### 3.4 Tonen
Appen snakker til brukeren som en trener ("Stay strong", "Finish it off", "Habit eliminated. New you.").

Det passer for No FAP-typen bruk. Passer det for en som vil drikke mer vann? Verdt å vurdere om tonen bør dempes, eller om den er en del av produktets identitet.

---

## 4. Produkt

### 4.1 Onboarding uten deg
Test: gi arket og lenken til noen uten å si et ord, og se hva som skjer.

- Skjønner de at de må fylle inn Control Panel først?
- Skjønner de forskjellen på "bad" og "good"?
- Skjønner de hva "focus habit" betyr og hvorfor det bare er én av hver?
- Finner de tilbake til appen dagen etter?

Alt de spør deg om, er noe produktet burde forklart selv.

### 4.2 Statistikk — hva er handlingsbart
Du har mye: streak, ukesprosent, sparkline, signal-score, next to fall, best/worst, heatmap, leaderboard.

For hver enkelt, still ett spørsmål: *hva gjør brukeren annerledes i morgen på grunn av dette tallet?*

- "Next to fall" består testen — den peker på én ting.
- "Best week: 64%" gjør sannsynligvis ikke.

Mindre og skarpere selger bedre enn mer.

### 4.3 Mobil
- "+ add habit"-fiksen: virker den etter push?
- Fungerer alle modaler på liten skjerm?
- Ser appen riktig ut lagt til på hjemskjermen (ikon, navn, statuslinje)?

### 4.4 Hva skjer når kunden slutter å betale
Arket er deres, delt fra din Drive. Du kan fjerne service-kontoen, men arket blir hos dem.

- Er det greit? (Det kan faktisk være et salgsargument: "dataene er dine".)
- Hva skjer med lenken?

---

## 5. Klar for salg

### 5.1 Nettsted
Du trenger en landingsside før du kan selge. Minimum:
- Hva det er, på én setning
- Tre skjermbilder
- Pris
- Kjøpsknapp

`habitally.no` er sannsynligvis ledig og koster ~100 kr/år. En `.vercel.app`-adresse i markedsføring undergraver inntrykket.

### 5.2 Betaling og levering
- Hvordan går kunden fra betaling til rad i Customers-arket?
- Kjører pipelinen automatisk, eller må du trykke på menyen hver gang?
- Stripe Payment Link + manuelt innlegg er helt greit for de første ti kundene.

### 5.3 Det juridiske
- Personvernerklæring: du lagrer navn, e-post og vanedata. GDPR gjelder.
- Vilkår: hva skjer ved oppsigelse, hva du garanterer.
- ENK-en din står som ansvarlig.

### 5.4 Support
- Hva svarer du når noen skriver "appen viser feil tall"?
- Har du en måte å se hva som skjedde? (Logging finnes i Vercel — vet du hvor?)

---

## Rekkefølge

1. **1.1 tilgangsmodell** — avgjør om resten er verdt tiden
2. **2.1 årsskifte** og **2.3 tidssone** — stille feil som ødelegger tillit
3. **3.2 påstander** — billig å fikse, dyrt å bli tatt i
4. **4.1 onboarding** — krever bare at du gir det til noen og holder munn
5. Resten

---

## Hva jeg trenger for å sjekke koden

Jeg har sett `index.html`, `api/_user.js` og `pipeline_code.gs`.

For punkt 1.2–1.5 og 2.1–2.5 trenger jeg:
- `api/toggle-habit.js`
- `api/get-habits.js`
- `api/get-stats.js`
- `api/update-config.js`
- `api/update-focus.js`
- `api/get-coaching.js`
- `stats.js`
- `vercel.json` (hvis den finnes)

Én fil om gangen er helt greit.
