'use strict';
/* Reading match lines: ring-name aliases, winners/losers, finishes, match types and
 * plain-English queries. Shared with Wrestling Chronology. Runs inside the search worker. */
const OFF_AIR_LINE = /^(?:[^:]{0,60}\b)?(?:dark(?: match)?|pre-?show(?: match)?|untelevised|non-televised)\b[^:]{0,60}:|\((?:dark(?: match)?|untelevised|not televised|pre-?show)\)|\b(?:dark match|untelevised|not televised|non-televised|off[- ]air|before the (?:show|broadcast) went on the air|pre-?show)\b/i;
const isOffAir = (line) => OFF_AIR_LINE.test(line);
const MATCH_LINE = /\b(?:defeated|defeats|beat|beats|def\.|vs\.?|v\.|versus|won|wins|pinned|pins|submitted|submits|submit|tapped out|outlasted|eliminated|draw|no contest|counted out|count-?out|disqualified|disqualification|battle royal|royal rumble)\b/i;
const isMatchLine = (line) => MATCH_LINE.test(line) && !/^[^:]{0,80}:\s*$/.test(line);

/* ---------------- ring-name aliases (same person, different names over the years) */
const ALIAS_GROUPS = [
  // NWA / WCW ring names that belong to the same person. Only names that person used:
  // a nickname someone else wrestled under (WCW had its own "The Hitman") isn't linked.
  ['Hulk Hogan', 'Hollywood Hogan', 'Hollywood Hulk Hogan', 'Terry Bollea', 'Mr. America'],
  ['Ric Flair', 'Nature Boy Ric Flair', 'The Nature Boy Ric Flair', 'Black Scorpion'],
  ['Sting', 'Flash', 'Steve Borden'],
  ['Bret Hart', 'Bret "Hitman" Hart', 'Bret The Hitman Hart'],
  ['Owen Hart'],
  ['Arn Anderson', 'Double A Arn Anderson'],
  ['Ole Anderson'],
  ['Tully Blanchard'],
  ['Barry Windham', 'Stalker', 'The Stalker', 'Blackjack Mulligan Jr.'],
  ['Lex Luger', 'The Total Package', 'Total Package'],
  ['Randy Savage', 'Macho Man Randy Savage', 'Macho Man'],
  ['Kevin Nash', 'Vinnie Vegas', 'Oz', 'Diesel'],
  ['Scott Hall', 'The Diamond Studd', 'Starship Coyote', 'Razor Ramon'],
  ['Sean Waltman', 'Syxx', 'Syxx-Pac', 'X-Pac', '1-2-3 Kid'],
  ['The Giant', 'Big Show', 'The Big Show', 'Paul Wight'],
  ['Goldberg', 'Bill Goldberg'],
  ['Diamond Dallas Page', 'DDP'],
  ['Booker T', 'Booker', 'Kole', 'G.I. Bro'],
  ['Stevie Ray'],
  ['Scott Steiner', 'Big Poppa Pump'],
  ['Rick Steiner', 'The Dog Faced Gremlin'],
  ['Sid Vicious', 'Sid', 'Sycho Sid', 'Sid Justice', 'Lord Humongous'],
  ['Vader', 'Big Van Vader'],
  ['Mick Foley', 'Cactus Jack', 'Mankind', 'Dude Love'],
  ['Steve Austin', 'Stunning Steve Austin', 'Stone Cold Steve Austin'],
  ['Brian Pillman', 'Flyin\' Brian', 'Flyin\' Brian Pillman', 'Yellow Dog', 'The Yellow Dog'],
  ['Dustin Rhodes', 'Seven', 'Goldust'],
  ['Dusty Rhodes', 'The American Dream Dusty Rhodes'],
  ['Big Bubba Rogers', 'Ray Traylor', 'The Boss', 'The Guardian Angel', 'Big Boss Man', 'Big Bubba'],
  ['Ron Simmons', 'Faarooq'],
  ['Butch Reed'],
  ['Magnum T.A.', 'Magnum TA'],
  ['Nikita Koloff'],
  ['Ivan Koloff'],
  ['Ronnie Garvin', 'Ron Garvin', 'Rugged Ronnie Garvin'],
  ['Terry Taylor', 'The Taylor Made Man'],
  ['Mike Rotunda', 'Michael Wallstreet', 'V. K. Wallstreet', 'VK Wallstreet'],
  ['Steven Regal', 'Lord Steven Regal', 'William Regal'],
  ['Fit Finlay', 'Finlay'],
  ['Johnny B. Badd', 'Marc Mero'],
  ['Paul Orndorff', 'Mr. Wonderful Paul Orndorff'],
  ['Jim Duggan', 'Hacksaw Jim Duggan'],
  ['Brutus Beefcake', 'The Butcher', 'The Disciple', 'The Booty Man', 'The Barber', 'Brother Bruti', 'Zodiac'],
  ['Ultimate Warrior', 'The Warrior', 'Warrior', 'The Ultimate Warrior'],
  ['Kevin Sullivan', 'The Taskmaster'],
  ['Meng', 'Haku'],
  ['Chris Kanyon', 'Kanyon', 'Mortis'],
  ['Disco Inferno', 'Disco'],
  ['Rey Mysterio Jr.', 'Rey Mysterio', 'Rey Misterio Jr.', 'Rey Misterio'],
  ['Juventud Guerrera', 'Juvi', 'The Juice'],
  ['Eddie Guerrero', 'Eddy Guerrero'],
  ['Chavo Guerrero Jr.', 'Chavo Guerrero'],
  ['Chris Jericho', 'Lionheart Chris Jericho'],
  ['Chris Benoit', 'Wild Pegasus', 'Pegasus Kid'],
  ['Dean Malenko'],
  ['Perry Saturn', 'Saturn'],
  ['Raven', 'Scotty Flamingo'],
  ['Konnan', 'K-Dawg', 'Max Moon'],
  ['Buff Bagwell', 'Marcus Bagwell', 'Marcus Alexander Bagwell'],
  ['Billy Kidman', 'Kidman'],
  ['Alex Wright', 'Berlyn'],
  ['Hugh Morrus', 'Bill DeMott', 'General Rection'],
  ['Shane Helms', 'Sugar Shane Helms', 'Hurricane Helms'],
  ['Ernest Miller', 'The Cat', 'Ernest "The Cat" Miller'],
  ['Curt Hennig', 'Mr. Perfect'],
  ['Road Warrior Hawk', 'Hawk'],
  ['Road Warrior Animal', 'Animal'],
  ['Larry Zbyszko'],
  ['Bobby Eaton', 'Beautiful Bobby Eaton'],
  ['Stan Lane', 'Sweet Stan Lane'],
  ['Jimmy Garvin', 'Gorgeous Jimmy Garvin'],
  ['Michael Hayes', 'P.S. Hayes'],
  ['Terry Funk'],
  ['Steve Williams', 'Dr. Death Steve Williams', 'Dr. Death'],
  ['Ricky Steamboat', 'Ricky The Dragon Steamboat'],
  ['Mr. Fuji'],
  ['Bam Bam Bigelow'],
  ['Jeff Jarrett', 'Double J Jeff Jarrett'],
  ['Mike Awesome'],
  ['Lance Storm'],
  ['Sean O\'Haire'],
  ['Elix Skipper', 'Primetime Elix Skipper'],
  ['Norman Smiley'],
  ['Hector Garza'],
  ['Psicosis', 'Psychosis'],
  ['Horace Hogan', 'Horace'],
  // ECW (and WWE's ECW)
  ['Taz', 'Tazz', 'Taz the Human Suplex Machine', 'Kid Krush'],
  ['Rob Van Dam', 'RVD', 'Mr. Monday Night Rob Van Dam'],
  ['Sabu'],
  ['The Sandman', 'Sandman', 'Mr. Sandman'],
  ['Tommy Dreamer'],
  ['Shane Douglas', 'The Franchise', 'Franchise Shane Douglas', 'Dean Douglas'],
  ['Bubba Ray Dudley', 'Buh Buh Ray Dudley', 'Brother Ray', 'Bully Ray'],
  ['D-Von Dudley', 'Devon Dudley', 'Brother Devon', 'Devon'],
  ['Spike Dudley'],
  ['Jerry Lynn'],
  ['Justin Credible'],
  ['Rhyno', 'Rhino'],
  ['Super Crazy'],
  ['Tajiri', 'Yoshihiro Tajiri'],
  ['Balls Mahoney'],
  ['Axl Rotten'],
  ['New Jack'],
  ['Al Snow', 'Leif Cassidy'],
  ['Chris Candido'],
  ['2 Cold Scorpio', 'Too Cold Scorpio', '2 Cold Scorpio'],
  ['Masato Tanaka'],
  ['Steve Corino'],
  ['C.W. Anderson', 'CW Anderson'],
  ['Little Guido', 'Little Guido Maritato', 'Nunzio'],
  ['Tracy Smothers'],
  ['Mikey Whipwreck'],
  ['Pitbull #1', 'Gary Wolfe'],
  ['Pitbull #2', 'Anthony Durante'],
  ['Don Muraco'],
  ['Eddie Gilbert', 'Hot Stuff Eddie Gilbert'],
  ['CM Punk'],
  ['Christian', 'Christian Cage'],
  ['Elijah Burke'],
  ['Matt Hardy'],
  ['Evan Bourne', 'Matt Sydal'],
  ['Kofi Kingston'],
  ['Jack Swagger'],
  ['Ezekiel Jackson'],
  ['Mark Henry'],
  ['Kurt Angle'],
  ['Bobby Lashley', 'Lashley'],
  ['Hardcore Holly', 'Bob Holly'],
  ['Kane'],
  ['Sheamus'],
];
const normName = (s) => String(s || '').toLowerCase().replace(/["“”]/g, '').replace(/\bjr\b\.?/g, 'jr').replace(/[^a-z0-9& ]+/g, ' ')
  .replace(/^the\s+/, '').replace(/\s+/g, ' ').trim();
const aliasIndex = new Map();
for (const group of ALIAS_GROUPS) {
  const norm = group.map(normName);
  for (const n of norm) aliasIndex.set(n, norm);
}
/* Names are matched whole: "Goldberg" is Goldberg (and his other ring names), never
   "Fake Goldberg"; "Horace Hogan" isn't Hulk Hogan. A partial name ("Hogan") picks the
   most likely wrestler and offers the others. */
let nameCounts = new Map(); // every wrestler name on the cards → number of matches
const groupOf = (name) => aliasIndex.get(name) || [name];
const containsWords = (name, q) => q.split(' ').every((w) => ` ${name} `.includes(` ${w} `));
/** {names: Set of exact names, key, others: [[name, count]], guessed} */
function resolvePerson(query) {
  const q = normName(query);
  if (!q) return null;
  if (aliasIndex.has(q) || nameCounts.has(q)) return { names: new Set(groupOf(q)), key: groupOf(q)[0], others: [], guessed: false };
  const cands = new Map();
  for (const [name, count] of nameCounts) {
    if (!containsWords(name, q)) continue;
    const key = groupOf(name)[0];
    cands.set(key, (cands.get(key) || 0) + count);
  }
  for (const [name, group] of aliasIndex) if (containsWords(name, q) && !cands.has(group[0])) cands.set(group[0], 0);
  if (!cands.size) return { names: new Set([q]), key: q, others: [], guessed: false };
  // On the cards first, then the well-known (alias table) names, then the most matches.
  const ranked = [...cands].sort((a, b) => ((b[1] > 0) - (a[1] > 0)) || (aliasIndex.has(b[0]) - aliasIndex.has(a[0])) || b[1] - a[1]);
  return { names: new Set(groupOf(ranked[0][0])), key: ranked[0][0], others: ranked.slice(1, 7).filter(([, c]) => c > 0), guessed: true };
}
/** Kept for older callers: every exact name for a query. */
function expandName(query) {
  const r = resolvePerson(query);
  return r ? [...r.names] : [];
}
function nameMatches(person, names) {
  return names instanceof Set ? names.has(person) : names.includes(person);
}

/* ---------------- match types */
// Checked in order; a match can have several (e.g. a ladder match for a title).
const MATCH_TYPES = [
  // Stipulations used in NWA / WCW and ECW. The list in the app only shows the ones that are in the database.
  ['WarGames', /war ?games|match beyond/i],
  ['World War 3 (60-man)', /world war (?:3|iii|three)|three[- ]ring battle royal|60[- ]man/i],
  ['Battle royal', /battle royal|battlebowl|battle bowl|over the top rope|bunkhouse stampede/i],
  ['Triple cage / Tower of Doom', /triple cage|tower of doom/i],
  ['Doomsday cage', /doomsday cage/i],
  ['Thundercage', /thunder ?cage/i],
  ['Chamber of Horrors', /chamber of horrors/i],
  ['Extreme Elimination Chamber', /extreme elimination chamber|elimination chamber/i],
  ['Steel cage', /steel cage|cage|six sides of steel/i],
  ['TLC / tables, ladders & chairs', /\btlc\b|tables,? ladders,? (?:and|&) chairs/i],
  ['Ladder', /ladder/i],
  ['Tables', /\btables? match|\btables? (?:dq|deathmatch)|through a table to win/i],
  ['Stretcher', /stretcher/i],
  ['Singapore cane', /singapore cane/i],
  ['Fans bring the weapons', /fans bring the weapons/i],
  ['Taipei death', /taipei death/i],
  ['Extreme rules', /extreme rules|extreme match/i],
  ['Three-way dance', /three[- ]way dance|four[- ]way dance|dance match/i],
  ['Scaffold', /scaffold/i],
  ['Lumberjack', /lumberjack/i],
  ['Bunkhouse', /bunkhouse/i],
  ['Texas bullrope', /texas bull ?rope|bull ?rope/i],
  ['Dog collar', /dog collar/i],
  ['Russian chain / strap', /russian chain|chain match|strap match|indian strap/i],
  ['Coal miner\'s glove', /coal miner'?s? glove|coal miner/i],
  ['Texas death', /texas death/i],
  ['Barbed wire', /barbed wire/i],
  ['Ambulance', /ambulance/i],
  ['Boot camp', /boot camp/i],
  ['Lights out', /lights out/i],
  ['Hardcore', /hardcore/i],
  ['Street fight', /chicago street fight|philadelphia street fight|street fight|parking lot brawl|san francisco 49ers|bunkhouse brawl/i],
  ['Falls count anywhere', /falls count anywhere/i],
  ['No DQ / no holds barred', /no (?:disqualification|dq)|no holds barred|anything goes|no rules/i],
  ['Last man standing', /last man standing/i],
  ['I Quit', /i quit|i respect you/i],
  ['Submission', /submission match|submission only/i],
  ['First blood', /first blood/i],
  ['Iron man', /iron man|\d+[- ]minute (?:match|challenge)/i],
  ['Two out of three falls', /(?:2|two) out of (?:3|three)|best of three falls/i],
  ['Loser leaves / retirement', /loser leaves|retirement|career (?:vs|match)|loser must retire/i],
  ['Hair / mask vs', /\bhair\b|\bmask\b|masks? vs/i],
  ['Tournament', /tournament|lethal lottery|crockett (?:sr\.? )?(?:memorial )?cup|great american bash tour|quarter-?final|semi-?final|\bfinal\b/i],
  ['Elimination', /elimination|survivor series/i],
  ['Handicap', /handicap/i],
  ['Triple threat / triangle', /triangle|triple threat|three[- ]way/i],
  ['Four-way and more', /four[- ]way|fatal four|fatal 4|five[- ]way|six[- ]way|seven[- ]way|eight[- ]way/i],
  ['Six-man / eight-man', /six[- ]man|6-man|eight[- ]man|8-man|trios/i],
  ['Tag team', /tag team|tag match|\btag\b/i],
  ['Singles', /singles/i],
  ['Title match', /(?<!non-)\b(?:title|championship)\b/i],
];
function matchTypes(line) {
  return MATCH_TYPES.filter(([, re]) => re.test(line)).map(([name]) => name);
}

/* ---------------- reading a card line */
const TEAMS = new Set(); // names seen with members in brackets, i.e. tag teams and groups
/** "A & B (w/ C) (c)" → ["a", "b"]; "Creative Control (Gerald and Patrick)" → team + members. */
function sideNames(side) {
  let s = side
    .replace(/\(\s*(?:w\s*\/|with\b|accompanied by\b)[^)]*\)/gi, ' ')          // (w/Jimmy Hart), (with Chyna)
    .replace(/\([^()]*(?::|referee|guest|enforcer|ringside|manager|valet|\d+(?:\.\d+)?%)[^()]*\)/gi, ' ') // (Special Referee: X), (6.69%)
    .replace(/\bw\/\s*[^,&()]+/gi, ' ')                                            // w/ Paul Bearer without brackets
    .replace(/\((?:c|champion|champions|\d{1,2}:\d{2}(?::\d{2})?)\)/gi, ' ');
  const names = [];
  s = s.replace(/([^,&()]+?)\s*\(([^()]+)\)/g, (_m, team, members) => {
    names.push(team);
    TEAMS.add(normName(team));
    members.split(/\s*(?:,|&|\band\b)\s*/i).forEach((x) => names.push(x));
    return ' ';
  });
  s.split(/\s*(?:,|&|\band\b|\/|\+)\s*/i).forEach((x) => names.push(x));
  // "WCW World Champion Bill Goldberg" → "Bill Goldberg"
  const noTitle = (x) => x.replace(/^\s*(?:the\s+)?(?:(?:new|reigning|former|undisputed|interim|wcw|nwa|wwf|world|united states|u\.?s\.?|tv|television|cruiserweight|hardcore|tag team|heavyweight|light heavyweight|junior heavyweight|national|western states|mid-atlantic|six-man|\s)+)champions?\s+(?=\S)/i, '');
  return [...new Set(names.map((x) => normName(noTitle(x))).filter((n) => n && n.length > 1 && !/^(?:w|with|c)$/.test(n)))];
}
function stripResultClauses(s) {
  return s
    .replace(/(?<!\b(?:vs|v|Jr|Sr|Mr|Mrs|Ms|Dr|St|Mt|Col|Sgt|Lt|Capt|Gen|No|Bros|[A-Z]))\.\s+[A-Z].*$/, '') // a following sentence ("Regal retains the title"), not "vs." / "Jr." / initials
    .replace(/\s+(?:ended in|went to|fought to|fought|wrestled to|battled to)\s+(?:a\s+|an\s+)?(?:\d+-minute\s+)?(?:time[- ]limit draw|draw|double|no contest|count-?out|countout)\b.*$/i, '')
    .replace(/\s+(?:with|and)\s+[^,]*?\s+as\s+(?:the\s+)?(?:special\s+)?(?:guest\s+)?(?:referee|enforcer)\b.*$/i, '')
    .replace(/\s+(?:for|in a match for|over) the [^,]*?(?:championship|title)\b.*$/i, '')
    .replace(/\s+at\s+(?:around\s+)?(?:the\s+)?(?:\d{1,2}:\d{2}|\d+[- ](?:second|minute))\b.*$/i, '')     // "at 8:04 with a cradle"
    .replace(/\s+with (?:a|an|the) (?:modified |running |top rope |diving |inside )?[^,&]*$/i, '')            // "with a roll up"
    .replace(/\s*\(\d{1,2}:\d{2}(?::\d{2})?\)\s*$/, '')
    .replace(/\s+-\s+(?:No Contest|Draw|Time Limit Draw|Double (?:Count-?out|DQ|Disqualification|Pin(?:fall)?))\b.*$/i, '')
    .replace(/\s+(?:to (?:retain|win|capture|become|earn|advance|keep|regain)|and (?:retain|win)s?)\b.*$/i, '')
    .replace(/\s+(?:by|via|after) (?:disqualification|DQ|count-?out|forfeit|submission|pinfall|referee'?s? decision|knockout|KO|TKO|stoppage|reverse decision|decision)\b.*$/i, '')
    .replace(/\s+(?:after|following|due to|when) .*$/i, '')
    .replace(/\s+in (?:a|an|the) [^,]*(?:match|bout|contest|final|tournament)\b.*$/i, '');
}
const RUN_IN = /interfer|run-?in|ran in|ran into the ring|interven|outside (?:help|involvement)|attacked|attacks|assault|jumped|blindsid|hit (?:him|her|them|\w+) with|involvement|came (?:out|down)|distract/i;

/** {winners, losers, all, outcome, dq, runIn, types} for one card line. */
function parseMatch(line) {
  const prefix = (line.match(/^[^:]{3,90}:\s+/) || [''])[0];
  let body = line.slice(prefix.length);
  const draw = /\b(?:no contest|time[- ]limit draw|draw|double (?:count-?out|count out|countout|dq|disqualification|pin(?:fall)?)|were (?:both )?counted out|both (?:men|teams|wrestlers) (?:were )?(?:counted out|disqualified))\b/i.test(body);
  // "No Disqualification Match" is a type, not a finish; only the result part counts.
  const dq = /\b(?:by|via|after a?|from)\s+(?:disqualification|dq)\b|\bdisqualified\b|\b(?:reverse|double) (?:disqualification|dq)\b/i.test(body);
  const runIn = dq && RUN_IN.test(body);
  let r;
  // "Undertaker made Animal submit to a kneebar" / "made X tap out"
  const madeSubmit = !draw && body.match(/^(.+?)\s+made\s+(.+?)\s+(?:submit|tap(?: out)?|quit|say i quit)\b/i);
  if (madeSubmit) body = `${madeSubmit[1]} defeated ${madeSubmit[2]}`;
  const won = body.match(/^(.+?)\s+(?:won|wins)\s+(?:the\s+|a\s+|an\s+)?(.+)$/i);
  const verdict = /\s+(?:defeated|defeats|beat|beats|def\.|pinned|pins|submitted|submits|outlasted|eliminated)\s+/i;
  if (won) {
    const last = won[2].match(/\blast eliminating\s+(.+)$/i);
    const winners = sideNames(stripResultClauses(won[1]));
    const losers = last ? sideNames(stripResultClauses(last[1])) : [];
    r = { winners, losers, all: [...new Set([...winners, ...losers])], outcome: 'win', sides: [winners, losers] };
  } else if (!draw && verdict.test(body)) {
    const [a, ...rest] = body.split(verdict);
    const winners = sideNames(stripResultClauses(a));
    const losers = sideNames(stripResultClauses(rest.join(' ')));
    r = { winners, losers, all: [...new Set([...winners, ...losers])], outcome: 'win', sides: [winners, losers] };
  } else {
    body = stripResultClauses(body);
    const sides = body.split(/\s+vs\.?\s+|\s+v\.\s+/i).map(sideNames).filter((x) => x.length);
    const all = [...new Set(sides.flat())];
    r = { winners: [], losers: [], all, outcome: draw ? 'draw' : 'unknown', sides: sides.length > 1 ? sides : [] };
  }
  r.dark = isOffAir(line);
  r.dq = dq;
  r.runIn = runIn;
  r.types = matchTypes(line);
  r.countout = /count-?out|counted out|count out/i.test(body);
  return r;
}

/* ---------------- plain-English queries */
/** Reads names, opponent, result, finish, match type and debut/last-match from the text. */
function parseQuery(text) {
  let t = ` ${String(text || '').toLowerCase().replace(/\s+/g, ' ').trim()} `;
  const q = { wrestler: '', opponent: '', result: 'any', finish: 'any', type: '', mode: 'all', dark: '', never: '', overall: false, opponents: [] };
  const take = (re) => { if (re.test(t)) { t = t.replace(re, ' '); return true; } return false; };
  if (take(/\s(?:dark matche?s?|dark|untelevised|pre-?shows?)\s/g)) q.dark = 'only';
  if (take(/\s(?:debuts?|debut matche?s?|first matche?s?|first appearances?)\s/g)) q.mode = 'debut';
  else if (take(/\s(?:last matche?s?|final matche?s?|farewell|last appearances?|final appearances?)\s/g)) q.mode = 'last';
  if (take(/\s(?:dq|disqualification)s?\s+(?:by|from|due to|because of|after)?\s*(?:a\s+)?(?:run-?ins?|interference)\s/g) || take(/\s(?:run-?ins?|interference)\s+(?:dq|disqualification)s?\s/g) || take(/\s(?:run-?ins?|interference)\s/g)) q.finish = 'runin';
  else if (take(/\s(?:dqs?|disqualifications?|disqualified)\s/g)) q.finish = 'dq';
  t = t.replace(/\s(tables?)\s(?!match)/g, ' $1 match '); // "Sabu tables" = tables matches
  for (const [name, re] of MATCH_TYPES) {
    const m = t.match(new RegExp(`\\s(?:${re.source})(?:\\s+match(?:es)?)?\\s`, 'i'));
    if (m && name !== 'Title match' && name !== 'Tag team' && name !== 'Singles') { q.type = name; t = t.replace(m[0], ' '); break; }
  }
  if (!q.type) {
    if (take(/\s(?:title|championship) match(?:es)?\s/g)) q.type = 'Title match';
    else if (take(/\stag(?: team)? match(?:es)?\s/g)) q.type = 'Tag team';
    else if (take(/\ssingles match(?:es)?\s/g)) q.type = 'Singles';
  }
  if (take(/\s(?:clean(?:ly)?|by pinfall|pinfall|pin ?fall wins?|by submission)\s/g)) q.finish = 'clean';
  // "X never beat Y", "X never beat Y or Z", "X never lost to Y", "who never beat X", "X never beat"
  const filler = (x) => x.replace(/\s(?:in|a|an|matches|match|on|at|ever|has|have|had|did)\s/g, ' ').replace(/\s(?:in|a|an|matches|match|on|at|ever)\s/g, ' ').trim();
  const list = (x) => filler(` ${x} `).split(/\s*(?:,|\bor\b|\band\b|\bnor\b|\/)\s*/).map((y) => y.trim()).filter(Boolean);
  const who = t.match(/^\s*(?:who|which wrestlers?|wrestlers? (?:that|who))\s+(?:has\s+|have\s+)?never\s+(beat|beaten|defeated|pinned|lost to|lose to)\s+(.+?)\s*$/);
  if (who) return { ...q, wrestler: filler(` ${who[2]} `), never: /lost|lose/.test(who[1]) ? 'beat' : 'lost', opponents: [], opponent: '' };
  const nev = t.match(/^\s*(.+?)\s+(?:has\s+|have\s+)?never\s+(beat|beaten|defeated|pinned|lost to|lose to|lost against|beat by|lost|lose|won|win|wins|was beaten|been beaten)\s*(.*?)\s*$/);
  if (nev) {
    const verb = nev[2];
    const opponents = nev[3] ? list(nev[3]) : [];
    const never = /lost|lose|by|beaten/.test(verb) && !/^beaten$/.test(verb) ? 'lost' : /^(?:won|win|wins)$/.test(verb) ? 'beat' : verb === 'beaten' ? 'lost' : 'beat';
    // "Goldberg never lost" / "never won" (no "to" and no names after it) asks about every match.
    const overall = !opponents.length && /^(?:lost|lose|won|win|wins|was beaten|been beaten)$/.test(verb);
    return { ...q, wrestler: filler(` ${nev[1]} `), never, overall, opponents, opponent: opponents[0] || '' };
  }
  const lostTo = t.match(/^\s*(.+?)\s+(?:lost to|loses to|lose to|was beaten by|beaten by)\s+(.+?)\s*$/);
  const beat = t.match(/^\s*(.+?)\s+(?:beat|beats|defeated|defeats|won against|wins against|over)\s+(.+?)\s*$/);
  if (lostTo) return { ...q, wrestler: lostTo[1].trim(), opponent: lostTo[2].trim(), result: 'lost' };
  if (beat) return { ...q, wrestler: beat[1].trim(), opponent: beat[2].trim(), result: 'won' };
  if (take(/\s(?:losses|loss|lost|loses|lose|losing)\s/g)) q.result = 'lost';
  else if (take(/\s(?:wins|win|won|winning|victories|victory)\s/g)) q.result = 'won';
  else if (take(/\s(?:draws|draw|no contests?|nc)\s/g)) q.result = 'draw';
  t = t.replace(/\s(?:and|matches|match|in|a|with|by|his|her|all|every|the)\s/g, ' ').replace(/\s(?:and|matches|match|in|a|with|by|his|her|all|every)\s/g, ' ');
  const vs = t.split(/\s(?:vs\.?|v\.?|versus|against)\s/);
  if (vs.length > 1) { q.opponent = vs.slice(1).join(' ').trim(); t = vs[0]; }
  q.wrestler = t.trim();
  return q;
}
