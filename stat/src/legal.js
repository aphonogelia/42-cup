/**
 * Legal pages for the statistics site.
 *
 * The Impressum is identical to the one in the game frontend: same operator,
 * same address. The privacy notice is shorter on purpose, because this site
 * has no accounts, no cookies and no storage on the device — it only renders
 * aggregates from the public stats endpoint.
 */

export const CONTACT_EMAIL = 'htharrau@student.42berlin.de';

const ADDRESS = ['Helene Tharrault c/o 42', 'Harzer Straße 39', '12043 Berlin', 'Deutschland'];

export const IMPRESSUM = {
  eyebrow: 'Rechtliche Angaben',
  title: 'Impressum',
  blocks: [
    {
      heading: 'Angaben gemäß § 5 DDG',
      lines: [...ADDRESS, `E-Mail: ${CONTACT_EMAIL}`],
    },
    {
      heading: 'Art des Angebots',
      paragraphs: [
        'Diese Statistikseite ist Teil von wordel // 42 Cup, einem privaten, nicht kommerziellen Freizeitprojekt. Es wird kein Gewerbe betrieben, es besteht keine Eintragung im Handelsregister und es wird keine Umsatzsteuer-Identifikationsnummer geführt.',
        'Es werden keine Entgelte erhoben, keine Werbung geschaltet, keine Spenden angenommen und keine Daten verkauft.',
      ],
    },
    {
      heading: 'Keine Verbindung zu 42 oder zur New York Times',
      paragraphs: [
        'Dieses Angebot ist weder mit 42, 42 Berlin, dem 42 Network noch mit The New York Times verbunden und wird von diesen nicht gesponsert oder unterstützt.',
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
        'Die dargestellten Zahlen werden automatisch aus Spieldaten berechnet, jedoch ohne Gewähr für Richtigkeit, Vollständigkeit und Aktualität. Für Inhalte externer Links sind ausschließlich deren Betreiber verantwortlich.',
      ],
    },
    {
      heading: 'Urheberrecht',
      paragraphs: [
        'Der Quellcode steht unter der MIT-Lizenz. Eine darüber hinausgehende Verwendung von Inhalten dieses Angebots bedarf der vorherigen Zustimmung.',
      ],
    },
    {
      heading: 'Stand',
      paragraphs: ['21. November 2026'],
    },
  ],
};

export const PRIVACY = {
  eyebrow: 'Datenschutz',
  title: 'Datenschutzerklärung',
  blocks: [
    {
      heading: '1. Verantwortlicher',
      paragraphs: [
        `Verantwortlich ist Helene Tharrault c/o 42, Harzer Straße 39, 12043 Berlin, Deutschland, E-Mail: ${CONTACT_EMAIL}.`,
        'Ein Datenschutzbeauftragter ist nicht bestellt, weil die gesetzlichen Voraussetzungen dafür nicht vorliegen.',
      ],
    },
    {
      heading: '2. Welche Daten hier verarbeitet werden',
      paragraphs: [
        'Diese Seite zeigt ausschließlich zusammengefasste Kennzahlen: Wörter pro Tag, Lösezeiten, Lösehäufigkeiten, Erstversuche und anonymisierte Beispielspiele. Es werden keine Namen, Logins, Profile oder einzelnen Spielzüge angezeigt.',
        'Beim Abruf der Seite verarbeitet der Server technisch bedingt die IP-Adresse, um Anfragen zu begrenzen. Eigene Zugriffsprotokolle führen wir nicht. Render führt als Hoster technische Protokolle und löscht sie nach sieben Tagen; für Vercel ist eine solche Frist nicht zugesagt, dort gelten die Nutzungsbedingungen von Vercel.',
        'Diese Seite setzt keine Cookies und speichert nichts auf deinem Gerät. Es gibt kein Tracking, keine Analyse-Werkzeuge und keine Werbung.',
      ],
    },
    {
      heading: '3. Rechtsgrundlagen',
      paragraphs: [
        'Bereitstellung der Seite: Art. 6 Abs. 1 lit. b DSGVO.',
        'Technischer Betrieb, Sicherheit und Ratenbegrenzung: Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse ist die Funktionsfähigkeit des Angebots.',
        'Eine Verarbeitung auf Grundlage einer Einwilligung findet nicht statt. Deshalb gibt es kein Einwilligungsbanner.',
      ],
    },
    {
      heading: '4. Herkunft der Zahlen und Speicherdauer',
      paragraphs: [
        'Die Kennzahlen werden nachts aus den Spieldaten berechnet und in zusammengefasster Form gespeichert. Sie enthalten keine personenbezogenen Daten und werden nicht mit einzelnen Personen verknüpft.',
        'Gastkonten im Spiel werden 90 Tage nach der letzten Vermutung gelöscht. Die daraus entstandenen Tageswerte bleiben als reine Summen erhalten.',
      ],
    },
    {
      heading: '5. Empfänger',
      paragraphs: [
        'Supabase: Datenbank, in der Europäischen Union betrieben.',
        'Vercel: Auslieferung dieser Seite.',
        'Render: Betrieb der API, die die Zahlen liefert.',
        'Mit Supabase und Render bestehen Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO. Vercel bietet für den kostenlosen Hobby-Tarif keinen solchen Vertrag an; dort gelten die Nutzungsbedingungen von Vercel.',
      ],
    },
    {
      heading: '6. Übermittlung in Drittländer',
      paragraphs: [
        'Vercel und Render haben ihren Sitz in den Vereinigten Staaten. Eine Übermittlung in die USA ist daher nicht auszuschließen. Bei Render stützt sie sich auf die Standardvertragsklauseln der EU-Kommission nach Art. 46 Abs. 2 lit. c DSGVO und, soweit der Anbieter zertifiziert ist, auf das EU-US Data Privacy Framework. Bei Vercel richtet sich die Verarbeitung nach den Nutzungsbedingungen von Vercel; ein Auftragsverarbeitungsvertrag besteht im Hobby-Tarif nicht.',
      ],
    },
    {
      heading: '7. Deine Rechte',
      paragraphs: [
        'Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21).',
        `Für Anfragen genügt eine E-Mail an ${CONTACT_EMAIL}. Anfragen werden unverzüglich, spätestens innerhalb eines Monats beantwortet.`,
        'Beschwerden nimmt die Berliner Beauftragte für Datenschutz und Informationsfreiheit entgegen, Alt-Moabit 59–61, 10555 Berlin, mail@datenschutz-berlin.de.',
      ],
    },
    {
      heading: '8. Stand',
      paragraphs: ['21. November 2026'],
    },
  ],
};
