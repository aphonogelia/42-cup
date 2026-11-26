/**
 * Legal pages for wordel // 42 Cup.
 *
 * Impressum is German only: it is an artefact of German law and the link label
 * has to be recognisable as such ("Impressum", not "Legal notice").
 * The privacy notice is bilingual because the app itself is English.
 *
 * Keep this file free of JSX so the same text can be copied to stat/.
 */

export const CONTACT_EMAIL = 'htharrau@student.42berlin.de';

const ADDRESS = ['Helene Tharrault c/o 42', 'Harzer Straße 39', '12043 Berlin', 'Deutschland'];

const IMPRESSUM_DE = [
    {
      heading: 'Angaben gemäß § 5 DDG',
      lines: [...ADDRESS, `E-Mail: ${CONTACT_EMAIL}`],
    },
    {
      heading: 'Art des Angebots',
      paragraphs: [
        'wordel // 42 Cup ist ein privates, nicht kommerzielles Freizeitprojekt. Es wird kein Gewerbe betrieben, es besteht keine Eintragung im Handelsregister und es wird keine Umsatzsteuer-Identifikationsnummer geführt.',
        'Es werden keine Entgelte erhoben, keine Werbung geschaltet, keine Spenden angenommen und keine Daten verkauft.',
      ],
    },
    {
      heading: 'Keine Verbindung zu 42 oder zur New York Times',
      paragraphs: [
        'Dieses Angebot ist weder mit 42, 42 Berlin, dem 42 Network noch mit The New York Times verbunden und wird von diesen nicht gesponsert oder unterstützt. Die Anmeldung über ein 42-Konto erfolgt mit den Zugangsdaten der Nutzerin oder des Nutzers und begründet keine weitere Verbindung.',
        '„Wordle“ ist eine Marke der The New York Times Company. Der Name wird hier nur beschreibend verwendet.',
      ],
    },
    {
      heading: 'Verbraucherstreitbeilegung',
      paragraphs: [
        'Es besteht keine Bereitschaft und keine Verpflichtung, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen (§ 36 VSBG).',
      ],
    },
    {
      heading: 'Haftung für Inhalte und Links',
      paragraphs: [
        'Die Inhalte dieses Angebots werden mit Sorgfalt erstellt, jedoch ohne Gewähr für Richtigkeit, Vollständigkeit und Aktualität. Für Inhalte externer Links sind ausschließlich deren Betreiber verantwortlich. Zum Zeitpunkt der Verlinkung waren keine Rechtsverstöße erkennbar.',
      ],
    },
    {
      heading: 'Urheberrecht',
      paragraphs: [
        'Der Quellcode steht unter der MIT-Lizenz. Die Wortlisten stammen aus öffentlich zugänglichen Quellen und sind im Repository genannt. Eine darüber hinausgehende Verwendung von Inhalten dieses Angebots bedarf der vorherigen Zustimmung.',
      ],
    },
    {
      heading: 'Stand',
      paragraphs: ['21. November 2026'],
    },
];

const IMPRESSUM_EN = [
  {
    heading: 'Information pursuant to § 5 DDG',
    lines: [
      'Helene Tharrault c/o 42',
      'Harzer Straße 39',
      '12043 Berlin',
      'Germany',
      `Email: ${CONTACT_EMAIL}`,
    ],
  },
  {
    heading: 'Nature of the service',
    paragraphs: [
      'wordel // 42 Cup is a private, non-commercial hobby project. There is no business, no entry in the commercial register and no VAT identification number.',
      'No fees are charged, no advertising is shown, no donations are accepted and no data is sold.',
    ],
  },
  {
    heading: 'Not affiliated with 42 or The New York Times',
    paragraphs: [
      'This service is not affiliated with, sponsored by or endorsed by 42, 42 Berlin, the 42 Network or The New York Times. Signing in with a 42 account uses the user’s own credentials and creates no further relationship.',
      '“Wordle” is a trademark of The New York Times Company. The name is used here in a descriptive sense only.',
    ],
  },
  {
    heading: 'Consumer dispute resolution',
    paragraphs: [
      'There is no willingness and no obligation to take part in dispute resolution proceedings before a consumer arbitration board (§ 36 VSBG).',
    ],
  },
  {
    heading: 'Liability for content and links',
    paragraphs: [
      'The content of this service is created with care but without any guarantee of accuracy, completeness or timeliness. The operators of external links are solely responsible for their content. No legal violations were apparent at the time of linking.',
    ],
  },
  {
    heading: 'Copyright',
    paragraphs: [
      'The source code is released under the MIT licence. The word lists come from publicly available sources named in the repository. Any further use of the content of this service requires prior consent.',
    ],
  },
  {
    heading: 'Last updated',
    paragraphs: ['21 November 2026'],
  },
];

export const IMPRESSUM = {
  eyebrow: 'Rechtliche Angaben',
  title: 'Impressum',
  blocks: [...IMPRESSUM_DE, { rule: true }, ...IMPRESSUM_EN],
};

const PRIVACY_DE = [
    {
      heading: '1. Verantwortlicher',
      paragraphs: [
        `Verantwortlich für die Datenverarbeitung auf dieser Webseite ist Helene Tharrault c/o 42, Harzer Straße 39, 12043 Berlin, Deutschland, E-Mail: ${CONTACT_EMAIL}.`,
        'Ein Datenschutzbeauftragter ist nicht bestellt, weil die gesetzlichen Voraussetzungen dafür nicht vorliegen.',
      ],
    },
    {
      heading: '2. Welche Daten verarbeitet werden',
      paragraphs: [
        'Konto: Bei der Anmeldung über 42 werden die interne Nutzer-ID (intra_id), der Login-Name und das Profilbild übernommen. Das Profilbild wird einmalig in unseren eigenen Speicher kopiert und von dort ausgeliefert.',
        'Spiel: Für jedes gestartete Wort werden Vermutungen, Buchstaben-Rückmeldungen, Zeitstempel, Anzahl der Versuche und das Ergebnis (gelöst, nicht gelöst, abgebrochen) gespeichert. Diese Daten bilden die Ranglisten.',
        'Missbrauchsabwehr: Beim Aufruf der API verarbeitet der Server die IP-Adresse, um Anfragen zu begrenzen. Auffällige Spieltage können mit einem internen Vermerk gekennzeichnet werden.',
        'Gäste: Ein Gastkonto besteht aus einem zufällig erzeugten Login, dem Anzeigenamen „Guest“ und den Spieldaten. Es wird kein 42-Konto und keine E-Mail-Adresse verlangt.',
        'Offene Rangliste: Die Rangliste „Open“ ist nur für ihre Mitglieder sichtbar. Wer sie öffnen will, muss beitreten und wählt dabei einen Handle; dieser wird zusammen mit den Ranglisten-Kennzahlen (Lösungsquote, durchschnittliche Versuche, Median, Score) angezeigt, nicht der Login. Gäste sind automatisch Mitglied und werden mit ihrem zufälligen Gast-Login als Handle aufgenommen. Die Einstellung „privat“ verbirgt nur Wortzeiten und Vermutungen; Handle, Kennzahlen und der Eintrag selbst bleiben sichtbar. Der Handle kann nach der Wahl nicht mehr geändert werden (außer Groß-/Kleinschreibung); eine Korrektur ist über die Kontaktadresse möglich.',
        'Nicht verarbeitet werden: E-Mail-Adressen, Passwörter, Zahlungsdaten, Standortdaten, Werbe-IDs. Es findet kein Tracking durch Dritte statt, es werden keine Analyse-Werkzeuge eingesetzt und es werden keine Profile für Werbung gebildet.',
      ],
    },
    {
      heading: '3. Zwecke und Rechtsgrundlagen',
      paragraphs: [
        'Bereitstellung des Spiels, des Kontos und der Ranglisten: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung bzw. Nutzung des Angebots).',
        'Abwehr von Missbrauch, Ratenbegrenzung und Erkennung unehrlicher Ergebnisse: Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse ist ein fairer Wettbewerb und die Funktionsfähigkeit des Dienstes.',
        'Technischer Betrieb und Fehlersuche: Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse ist die Sicherheit und Stabilität des Angebots.',
        'Eine Verarbeitung auf Grundlage einer Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO findet derzeit nicht statt. Deshalb gibt es auch kein Einwilligungsbanner.',
      ],
    },
    {
      heading: '4. Speicherdauer',
      paragraphs: [
        'Gastkonten werden 90 Tage nach der letzten Vermutung automatisch gelöscht; hat ein Gast nie geraten, 90 Tage nach der Anlage. Der Löschlauf findet täglich um 03:00 UTC statt und entfernt Konto, Ergebnisse, Vermutungen, Abgabe-Protokoll und Vermerke.',
        'Registrierte Konten bleiben bis zur Löschung durch die Nutzerin oder den Nutzer bestehen. Mit der Kontolöschung werden Konto, Ergebnisse, Vermutungen, Abgabe-Protokoll und Vermerke entfernt.',
        'Vermerke über auffällige Spieltage bleiben bis zur Löschung des Kontos bestehen; ab dem Vermerk zählt der Tag nicht mehr für die Ranglisten.',
        'IP-Adressen werden für die Ratenbegrenzung nur im Arbeitsspeicher des Servers gehalten, längstens für die Dauer des Zählfensters (eine Minute, bei der Anlage von Gastkonten eine Stunde). Eigene Zugriffsprotokolle führen wir nicht. Render führt als Hoster technische Protokolle und löscht sie nach sieben Tagen. Für Vercel ist eine solche Frist nicht zugesagt; dort gelten die Nutzungsbedingungen von Vercel.',
      ],
    },
    {
      heading: '5. Empfänger und Auftragsverarbeiter',
      paragraphs: [
        'Supabase: Datenbank und Speicher für Profilbilder, in der Europäischen Union betrieben.',
        'Vercel: Auslieferung der Webseite.',
        'Render: Betrieb des API-Servers.',
        '42 (api.intra.42.fr): ausschließlich die Anmeldung und das einmalige Abrufen des Profils.',
        'Mit Supabase und Render bestehen Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO. Vercel bietet für den kostenlosen Hobby-Tarif keinen solchen Vertrag an; dort gelten die Nutzungsbedingungen von Vercel. Eine Weitergabe zu Werbe- oder Verkaufszwecken findet nicht statt.',
      ],
    },
    {
      heading: '6. Übermittlung in Drittländer',
      paragraphs: [
        'Vercel und Render haben ihren Sitz in den Vereinigten Staaten. Eine Übermittlung personenbezogener Daten in die USA ist daher nicht auszuschließen. Bei Render stützt sie sich auf die Standardvertragsklauseln der EU-Kommission nach Art. 46 Abs. 2 lit. c DSGVO und, soweit der Anbieter zertifiziert ist, auf das EU-US Data Privacy Framework. Bei Vercel richtet sich die Verarbeitung nach den Nutzungsbedingungen von Vercel; ein Auftragsverarbeitungsvertrag besteht im Hobby-Tarif nicht.',
        'Die Anmeldung über 42 übermittelt Zugangsdaten an api.intra.42.fr; 42 betreibt diesen Dienst innerhalb der Europäischen Union.',
      ],
    },
    {
      heading: '7. Speicherung auf deinem Gerät (§ 25 TDDDG)',
      paragraphs: [
        'auth_token: das signierte Anmeldetoken. Ohne dieses Token könnte die Anmeldung nicht gehalten werden. Unbedingt erforderlich.',
        'wordel-theme: die gewählte helle oder dunkle Darstellung. Wird nur gespeichert, weil du sie umschaltest.',
        'wordel-progress-<login>-<datum>: eine Kopie des heutigen Fortschritts, damit die Oberfläche beim Laden nicht leer erscheint. Funktional für die Anzeige des Spielstands.',
        'Ein Cookie des Anmeldevorgangs: wird von der OAuth-Bibliothek gesetzt, um den Rücksprung von 42 abzusichern, und nur während der Anmeldung benötigt.',
        'Alle genannten Einträge sind unbedingt erforderlich oder entsprechen einer ausdrücklichen Auswahl. Nach § 25 Abs. 2 Nr. 2 TDDDG ist dafür keine Einwilligung nötig. Du kannst sie jederzeit im Browser löschen; die Anmeldung endet damit.',
      ],
    },
    {
      heading: '8. Deine Rechte',
      paragraphs: [
        'Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21).',
        'Auskunft und Löschung kannst du direkt in der App auslösen: „Meine Daten herunterladen“ liefert eine JSON-Datei mit Konto, Ergebnissen, Vermutungen und Vermerken. „Konto löschen“ entfernt Konto, Ergebnisse, Vermutungen, Abgabe-Protokoll und das gespiegelte Profilbild endgültig.',
        'Eine Korrektur des Handles ist in der App nicht möglich; wende dich dafür an die Kontaktadresse.',
        `Für alles Weitere genügt eine E-Mail an ${CONTACT_EMAIL}. Anfragen werden unverzüglich, spätestens innerhalb eines Monats beantwortet.`,
        'Beschwerden nimmt die Berliner Beauftragte für Datenschutz und Informationsfreiheit entgegen, Alt-Moabit 59–61, 10555 Berlin, mail@datenschutz-berlin.de.',
      ],
    },
    {
      heading: '9. Pflicht zur Bereitstellung',
      paragraphs: [
        'Die Angabe von Daten ist weder gesetzlich noch vertraglich vorgeschrieben. Ohne Konto oder Gastkonto ist eine Teilnahme am Spiel und an den Ranglisten technisch nicht möglich. Wer keine Daten angeben möchte, kann das Angebot nicht nutzen.',
      ],
    },
    {
      heading: '10. Keine automatisierte Entscheidung',
      paragraphs: [
        'Auffällige Spieltage werden gekennzeichnet und manuell geprüft. Ein Ausschluss von einer Rangliste ist keine Entscheidung mit rechtlicher Wirkung im Sinne des Art. 22 DSGVO. Es findet kein Profiling für Werbung statt.',
      ],
    },
    {
      heading: '11. Stand',
      paragraphs: ['26. November 2026'],
    },
];

const PRIVACY_EN = [
    {
      heading: '1. Controller',
      paragraphs: [
        `The controller for data processed on this site is Helene Tharrault c/o 42, Harzer Straße 39, 12043 Berlin, Germany, email ${CONTACT_EMAIL}.`,
        'No data protection officer has been appointed, because the legal conditions for one are not met.',
      ],
    },
    {
      heading: '2. What is processed',
      paragraphs: [
        'Account: when you sign in with 42 we receive your internal user ID (intra_id), login name and avatar. The avatar is copied once into our own storage and served from there.',
        'Game: for every word you start we store your guesses, the letter feedback, timestamps, the number of tries and the outcome (solved, failed, unfinished). This data makes up the leaderboards.',
        'Abuse prevention: the server processes your IP address to rate-limit requests. A day with suspicious play can be marked with an internal note.',
        'Guests: a guest account is a random login, the display name “Guest” and the game data. No 42 account and no email address is required.',
        'Open leaderboard: the “Open” board is visible to its members only. A 42 player has to join to see it, choosing a handle; the handle is shown with your leaderboard figures (solve rate, average tries, median, score) instead of your login. Guests are members automatically under their random guest login. The “private” setting hides only word times and guesses; the handle, the figures and the entry itself stay visible. A handle cannot be changed once chosen (apart from letter case); corrections go through the contact address.',
        'Not processed: email addresses, passwords, payment data, location data, advertising IDs. There is no third-party tracking, no analytics tool, and no advertising profile is built.',
      ],
    },
    {
      heading: '3. Purposes and legal bases',
      paragraphs: [
        'Running the game, your account and the leaderboards: Art. 6(1)(b) GDPR.',
        'Preventing abuse, rate limiting and detecting dishonest results: Art. 6(1)(f) GDPR. The legitimate interest is fair competition and a working service.',
        'Technical operation and debugging: Art. 6(1)(f) GDPR. The legitimate interest is the security and stability of the service.',
        'Nothing is processed on the basis of consent under Art. 6(1)(a) GDPR at the moment, which is why there is no consent banner.',
      ],
    },
    {
      heading: '4. Retention',
      paragraphs: [
        'Guest accounts are deleted automatically 90 days after the last guess, or 90 days after creation if the guest never guessed. The purge runs daily at 03:00 UTC and removes the account, results, guesses, the submission log and notes.',
        'Registered accounts stay until you delete them. Deleting the account removes the account, results, guesses, the submission log and notes.',
        'Notes about suspicious days stay until the account is deleted; from the note onwards that day no longer counts for the leaderboards.',
        'IP addresses are held for rate limiting in server memory only, for the length of the counting window (one minute, one hour for creating guest accounts). We keep no access logs of our own. Render keeps technical logs as our host and deletes them after seven days. Vercel does not commit to such a period; its terms of use apply.',
      ],
    },
    {
      heading: '5. Recipients and processors',
      paragraphs: [
        'Supabase: database and avatar storage, operated in the European Union.',
        'Vercel: delivery of the website.',
        'Render: operation of the API server.',
        '42 (api.intra.42.fr): sign-in only, and a single fetch of your profile.',
        'Data processing agreements under Art. 28 GDPR are in place with Supabase and Render. Vercel does not offer one on the free Hobby plan, so its terms of use apply instead. No data is shared for advertising or sold.',
      ],
    },
    {
      heading: '6. Transfers outside the EU',
      paragraphs: [
        'Vercel and Render are based in the United States, so a transfer of personal data to the US cannot be ruled out. For Render it relies on the European Commission’s Standard Contractual Clauses under Art. 46(2)(c) GDPR and, where the provider is certified, on the EU-US Data Privacy Framework. For Vercel the processing follows Vercel’s terms of use; there is no data processing agreement on the Hobby plan.',
        'Signing in with 42 sends credentials to api.intra.42.fr, which 42 operates inside the European Union.',
      ],
    },
    {
      heading: '7. Storage on your device (§ 25 TDDDG)',
      paragraphs: [
        'auth_token: your signed session token. Without it the sign-in cannot be kept. Strictly necessary.',
        'wordel-theme: the light or dark appearance you picked. Stored only because you switched it.',
        'wordel-progress-<login>-<date>: a copy of today’s progress so the interface does not start empty. Functional for displaying your game state.',
        'A sign-in cookie: set by the OAuth library to secure the return from 42, needed only during sign-in.',
        'All of these are strictly necessary or reflect an explicit choice, so no consent is required under § 25(2) No. 2 TDDDG. You can delete them in your browser at any time, which ends your session.',
      ],
    },
    {
      heading: '8. Your rights',
      paragraphs: [
        'You have the right to access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction (Art. 18), data portability (Art. 20) and objection to processing based on legitimate interests (Art. 21).',
        'Access and erasure can be triggered in the app: “Download my data” gives you a JSON file with your account, results, guesses and notes. “Delete my account” permanently removes the account, results, guesses, the submission log and the mirrored avatar.',
        'A handle cannot be corrected in the app; write to the contact address for that.',
        `For anything else, email ${CONTACT_EMAIL}. Requests are answered without undue delay and within one month at the latest.`,
        'Complaints go to the Berlin Commissioner for Data Protection and Freedom of Information, Alt-Moabit 59–61, 10555 Berlin, mail@datenschutz-berlin.de.',
      ],
    },
    {
      heading: '9. Do you have to provide data?',
      paragraphs: [
        'Providing data is neither legally nor contractually required. Without an account or a guest account, playing and ranking are technically impossible. If you do not want to provide data, you cannot use the service.',
      ],
    },
    {
      heading: '10. No automated decisions',
      paragraphs: [
        'Suspicious days are flagged and reviewed manually. Removal from a leaderboard is not a decision with legal effect under Art. 22 GDPR. There is no advertising profiling.',
      ],
    },
    {
      heading: '11. Last updated',
      paragraphs: ['26 November 2026'],
    },
];

// English first: the app is English, the German text follows as the legally
// authoritative version.
export const PRIVACY = {
  eyebrow: 'Datenschutz',
  title: 'Datenschutzerklärung',
  blocks: [...PRIVACY_EN, { rule: true }, ...PRIVACY_DE],
};
