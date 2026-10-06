// Kapholdets uge 40-program, træningstidspunkter og intensiteter – fra klubbens egne dokumenter
// ("U40 2026", "Træningstidspunkter kapholdet", "Træningsprogrammer kapholdet"). Bruges som testdata.

export const COACHES = { torsten: 'Torsten', christen: 'Christen' };

const WARMUP = {
  title: 'Fast opvarmningsprogram (før dagens første pas)',
  details: [
    'Hofteflex classic: 10 lette på hver + 5 svære på hver',
    'Sidebøj: 2 x 5 på hver',
    'Arm til øre: 2 x 5 på hver',
    'Mavedans for kajakroere: begge slags 10 hver vej',
    '"Gå på røven" to og to: 10+10+10+10 begge retninger',
    'Hånd-til-fod stående: 5 lange stræk',
    'Et-bens hofteballet: 3x3 på hvert ben',
    'Håndledsfly: 2x10 hver',
    'Sideplanke: 2x15" hver side',
  ].join('\n'),
  minutes: 15,
};

const OPV = { title: 'Opvarmningsprogram', details: 'Opv. program på vandet', minutes: null };

/**
 * Ugeplanen. day: 1 = mandag … 7 = søndag. joint = fællestræning (fed i skemaet).
 * Tidspunkter er "omklædt og klar". Øvrige pas ligger i et af dagens andre vinduer – tidspunktet er et forslag.
 */
export const WEEK = [
  // Mandag er "Fri" i tidsskemaet, men har program i U40. Der oprettes ingen aftaler (intet tidspunkt).
  {
    day: 2, time: '16:00', minutes: 90, joint: true,
    title: 'Kajak: En lang dag i pyramiderne',
    program: [OPV, {
      title: 'Pyramider 5x(1\'/2\'/3\'/2\'/1\')',
      details: 'i3 / i2 høj / i2 middel / i2 høj / i3\n3\' pause mellem hver pyramide.\n'
        + '(Svarer til "En stor dag i pyramiderne" i programbeskrivelsen.)',
      minutes: 57,
    }],
  },
  {
    day: 2, time: '14:00', minutes: 45,
    title: 'Løb: 60"/30"\'ere',
    program: [
      { title: 'Opvarmning', details: '10\' løb i2', minutes: 10 },
      { title: 'Hovedsæt 4x(4x60"/30")', details: 'i3 / i2', minutes: 24 },
      { title: 'Nedløb', details: '5\' roligt', minutes: 5 },
    ],
  },
  {
    day: 3, time: '16:00', minutes: 90, joint: true,
    title: 'Kajak: Trappesprinter',
    program: [OPV, {
      title: 'Trappesprinter',
      details: [
        '2x25 m i5 (90-95) – lav frekvens og flyt båd',
        '2x50 m i5 (90-95) – med modstand, flyt båd',
        '2x75 m i5 (95) – lav frekvens og flyt båd de første 50 m, de sidste 25 m trækkes frekvensen op til i6 (110)',
        '2x100 m i6 fuld pedal (men husk flyt båd)',
        '2x150 m i6 fuld pedal (men husk flyt båd)',
      ].join('\n'),
      minutes: null,
    }],
  },
  {
    day: 3, time: '14:00', minutes: 75,
    title: 'Styrke: VT blandede bolsjer 1 (4x12)',
    description: 'VT eller onsdagsræs – ikke begge.',
    program: [{
      title: 'Blandede bolsjer 1 – 4x12, gerne dobbeltsæt',
      details: 'Dødløft\n3 ryg-øvelser\n2 bryst-øvelser\n1 skulder-øvelse\n1 armøvelse\n1 hofte-øvelse\nFod til hånd',
      minutes: null,
    }],
  },
  {
    day: 3, time: '17:30', minutes: 60,
    title: 'Kajak: Onsdagsræs',
    description: 'VT eller onsdagsræs – ikke begge.',
    program: [],
  },
  {
    day: 4, time: '16:00', minutes: 90, joint: true, coach: 'torsten',
    title: 'Kajak: Norsk VO2max',
    program: [
      OPV,
      { title: 'Hovedsæt 4x(4\'/4\')', details: 'i4 (tærskel) / pause', minutes: 32 },
      { title: 'Afroning', details: '8\' i2 lav', minutes: 8 },
    ],
  },
  {
    day: 4, time: '14:00', minutes: 30,
    title: 'Løb 30\' i2',
    description: 'Husk at spise inden.',
    program: [{ title: 'Løb', details: '30\' i2', minutes: 30 }],
  },
  {
    // Fredag har ingen fællestræning i skemaet; vinduer 7.45, 14.00, 16.00 og 17.30.
    day: 5, time: '16:00', minutes: 75,
    title: 'Kajak: 12x4\'/1\'',
    program: [{
      title: '12x4\'/1\'',
      details: 'Skiftevis i2 (68-70) og i3 (72-74)',
      minutes: 60,
    }],
  },
  {
    day: 5, time: '14:00', minutes: 75,
    title: 'Styrke: Blandede bolsjer 2 (4x12)',
    program: [{
      title: 'Blandede bolsjer 2 – 4x12, gerne dobbeltsæt',
      details: 'Frivend\n3 ryg-øvelser\n2 bryst-øvelser\n1 skulder-øvelse\n1 armøvelse\n1 hofte-øvelse\nSkrå mave m. OL-stang\nLænd m. vægt',
      minutes: null,
    }],
  },
  {
    day: 6, time: '09:00', minutes: 90, joint: true, coach: 'christen',
    title: 'Kajak (mandskabsbåde): Mandskabsraketter',
    program: [
      OPV,
      { title: '4x(1\'/1\'/1\')', details: 'i2 (72) / i3 (78) / i4 (90)\n2\' pause', minutes: 18 },
      { title: '4x(30"/30"/30")', details: 'i3 (78) / i4 (84) / i5 (95)\n2\' pause', minutes: 12 },
      { title: '4x(15"/15"/15")', details: 'i4 (80) / i5 (95) / i6 (110)', minutes: 3 },
      { title: '3x3\'/1\'', details: 'i2 (68) / pause', minutes: 12 },
    ],
  },
  {
    day: 6, time: '16:00', minutes: 90,
    title: 'Kajak: The thrilling thirties (2 runder)',
    description: '"The thrilling thirties" kan være svære at huske, hvis man ikke ser systemet i minutterne. '
      + 'Hver 30 minutter er bygget op af to timinutters 4-1-5 og én timinutters 5-4-1. Idéen er, at '
      + 'intensiteterne kører op og ned i 30 minutter efter det system, programmet laver. Forestil jer '
      + 'intensiteterne som et trappediagram, så er det nemmere at huske.',
    program: [{
      title: '2x(4\'+1\'+5\'+4\'+1\'+5\'+5\'+4\'+1\')',
      details: 'i3 (74-76) / i4 (80-82) / i2 (68) / i3 (74-76) / i4 (80-82) / i2 (68) / i2 (68) / i3 (74-76) / i5 (95)\n5\' pause mellem runderne',
      minutes: 65,
    }],
  },
  {
    day: 7, time: '10:00', minutes: 90, joint: true, coach: 'torsten',
    title: 'Kajak (mandskabsbåde): Stort spionprogram',
    program: [{
      title: 'Stort spionprogram',
      details: [
        '2x5\'/1\' i2 (68-70)',
        '4x120"/30" i2 (70)',
        '6x90"/30" i2 (72)',
        '8x70"/20" i3 (74)',
        '10x45"/15" i3 (78)',
        '2\'-3\' sætpause',
      ].join('\n'),
      minutes: 66,
    }],
  },
  {
    day: 7, time: '16:00', minutes: 45,
    title: 'Løb eller baglændsergo: 2x4x(3\'/1\')',
    program: [{ title: '2x4x(3\'/1\')', details: 'i3 / i2', minutes: 32 }],
  },
  {
    day: 7, time: '16:45', minutes: 60,
    title: 'Core / skadesforebyggende / udstræk',
    program: [{
      title: 'Core, skadesforebyggende og udstræk – 60\'',
      details: 'Fx rotationssideplanke, armbøjninger på bold, kosteskaft for underarm og udstræk.',
      minutes: 60,
    }],
  },
].map((s) => ({ ...s, warmup: WARMUP }));

export const WINDOWS = {
  2: ['7.45', '14.00', '16.00', '17.30'],
  3: ['7.45', '14.00', '16.00', '17.30'],
  4: ['7.45', '14.00', '16.00', '17.30'],
  5: ['7.45', '14.00', '16.00', '17.30'],
  6: ['9.00', '16.00'],
  7: ['10.00', '16.00'],
};

export const INTENSITIES = `Intensiteter (omtrentlig frekvens · puls):
• i2 lav: 60-66 · <120 – afslappet indsats, let spænding i core, hofte og ben
• i2 middel: 66-68 · 120-130 – jævn indsats, kan holdes i op til 10 min
• i2 høj: 68-72 · 130-140 – åndedrættet arbejder, høj kraft pr. tag, kan holdes 4-5 min
• i3: 72-76 · 140-160 – frekvensen føles høj, man skal anstrenge sig sidst i intervallerne
• i4: 76-90 · 160-180 – hårdt, på tærsklen, nævneværdig mælkesyre
• i5: 90-120 · 180-210 – maksimal indsats på distancen (banetempo)
• i6: >120 · 190-210 – fuld pedal
• i6 kontrol: ca. 120 · 190-200 – som fuld pedal, men lidt igen for vandføling
• Powerstrokes: 50-70 – (næsten) maksimal kraft i hvert tag, langt glid`;

export const INFO = `Træningstidspunkter kapholdet:
• Hver dag er ét vindue fællestræning – her afvikles dagens hovedpas på vandet. Kom så vidt muligt.
• Øvrige pas lægger man i et af de andre vinduer, så alle har nogen at træne med.
• Vil man tilgodeses i klubbens mandskabsbåde, skal man komme til fællestræningerne med træner.
• Tidspunkterne er omklædt og klar.
• Det "gamle kaphold" starter fra uge 40. Det "gamle træningshold" holder sæsonpause i 2 af ugerne 40-42 – men vi ror mandskabsbåde søndage kl. 10.00.
• Fra uge 43 træner alle ud fra oplægget.
• Svømning og gymnastiksal starter efter efterårsferien. Fredagsløb starter, når vi ikke længere kan nå på vandet fredag eftermiddag.
Ring eller skriv til Torsten, hvis I har spørgsmål til programmet.`;
