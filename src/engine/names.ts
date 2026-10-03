// Name pools for fictional players, coaches and media. Combinations are random,
// so generated people are fictional.

const NA_FIRST = ['Liam', 'Noah', 'Owen', 'Logan', 'Ethan', 'Carter', 'Hunter', 'Tyler', 'Brady', 'Cole', 'Jack', 'Lucas', 'Mason', 'Nathan', 'Ryan', 'Dylan', 'Jake', 'Connor', 'Evan', 'Caleb', 'Brayden', 'Austin', 'Jordan', 'Cameron', 'Kyle', 'Blake', 'Mitchell', 'Spencer', 'Garrett', 'Tanner', 'Cody', 'Riley', 'Parker', 'Wyatt', 'Chase', 'Gavin', 'Landon', 'Jaxon', 'Easton', 'Zach', 'Matthew', 'Michael', 'Brett', 'Shane', 'Trevor', 'Colby', 'Nolan', 'Sawyer', 'Reid', 'Jett', 'Beckett', 'Cooper', 'Declan', 'Graham', 'Hayden', 'Keegan', 'Maddox', 'Quinn', 'Rhett', 'Tate'];
const CAN_LAST = ['MacDonald', 'Tremblay', 'Gagnon', 'Roy', 'Côté', 'Bouchard', 'Gauthier', 'Morin', 'Lavoie', 'Fortin', 'Gagné', 'Ouellet', 'Pelletier', 'Bélanger', 'Lévesque', 'Bergeron', 'Leblanc', 'Paquette', 'Girard', 'Simard', 'Boucher', 'Caron', 'Beaulieu', 'Cloutier', 'Dubé', 'Poirier', 'Fournier', 'Lapointe', 'Mercier', 'Campbell', 'Stewart', 'Robertson', 'Fraser', 'McKenzie', 'Henderson', 'Sinclair', 'Ferguson', 'Gillis', 'McLeod', 'Murray', 'Reid', 'Duncan', 'Graham', 'Kerr', 'Ross', 'Hamilton', 'McIntyre', 'Bowman', 'Ritchie', 'Desjardins', 'Thibault', 'Lacroix', 'Arsenault', 'Vachon', 'Comeau', 'Robichaud', 'Doucet', 'Hebert', 'Landry', 'Savard', 'Pageau', 'Lemieux', 'Turcotte', 'Carrier', 'Dion', 'Brassard', 'Kowalchuk', 'Wiebe', 'Klassen', 'Friesen', 'Penner', 'Dyck', 'Unger', 'Thiessen', 'Holmgren', 'Sutherland', 'Whitfield', 'Ashcroft', 'Blackwood', 'Kingsley', 'Harwood'];
const CAN_FIRST_FR = ['Alexandre', 'Mathieu', 'Olivier', 'Samuel', 'Gabriel', 'Félix', 'Maxime', 'Antoine', 'Julien', 'Xavier', 'Raphaël', 'Thomas', 'Zachary', 'Philippe', 'Étienne', 'Vincent', 'Simon', 'Charles', 'Jérémy', 'Benjamin'];
const USA_LAST = ['Johnson', 'Miller', 'Anderson', 'Thompson', 'Walsh', 'Sullivan', 'Murphy', 'Kelly', "O'Connor", 'Brennan', 'Fitzgerald', 'Gallagher', 'Doherty', 'Kowalski', 'Novak', 'Schmidt', 'Larson', 'Olson', 'Peterson', 'Lindgren', 'Hanson', 'Carlson', 'Erickson', 'Swanson', 'Nelson', 'Becker', 'Hoffman', 'Keller', 'Wagner', 'Fischer', 'Brooks', 'Hayes', 'Bennett', 'Coleman', 'Patterson', 'Morrison', 'Sheridan', 'Donnelly', 'McCarthy', 'Flanagan', 'Callahan', 'Dempsey', 'Hogan', 'Kearney', 'Moriarty', 'Brady', 'Cullen', 'Lynch', 'Monahan', 'Riordan', 'Gaffney', 'Tierney', 'Whalen', 'Hartley', 'Prescott', 'Whitaker', 'Garrison', 'Holloway', 'Pruitt', 'Langford', 'Ainsworth', 'Hollister', 'Stanton', 'Barrett', 'Calloway', 'Easterly', 'Fairbanks', 'Grady', 'Hendricks', 'Ingram'];
const SWE_FIRST = ['Erik', 'Lucas', 'Oscar', 'William', 'Hugo', 'Elias', 'Axel', 'Filip', 'Linus', 'Viktor', 'Anton', 'Isak', 'Jonathan', 'Ludvig', 'Emil', 'Gustav', 'Albin', 'Melker', 'Theo', 'Noel', 'Rasmus', 'Oliver', 'Jesper', 'Simon', 'Leo', 'Adam', 'Alexander', 'Johan', 'Marcus', 'Viggo', 'Otto', 'Ville', 'Hampus', 'Love', 'Sixten', 'Elliot'];
const SWE_LAST = ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson', 'Gustafsson', 'Pettersson', 'Jonsson', 'Jansson', 'Hansson', 'Bengtsson', 'Jönsson', 'Lindberg', 'Jakobsson', 'Magnusson', 'Lindström', 'Olofsson', 'Lindqvist', 'Lindgren', 'Berg', 'Axelsson', 'Bergström', 'Lundberg', 'Lind', 'Lundgren', 'Lundqvist', 'Mattsson', 'Berglund', 'Fredriksson', 'Sandberg', 'Henriksson', 'Forsberg', 'Sjöberg', 'Wallin', 'Engström', 'Danielsson', 'Håkansson', 'Eklund', 'Lundin', 'Gunnarsson', 'Holm', 'Samuelsson', 'Fransson', 'Bergqvist', 'Nyström', 'Holmberg', 'Arvidsson', 'Löfgren', 'Söderberg', 'Nyberg', 'Blomqvist', 'Claesson', 'Nordström', 'Mårtensson', 'Lundström', 'Viklund', 'Björk', 'Ekström', 'Hedlund', 'Strand', 'Åberg', 'Sundqvist', 'Öberg', 'Wikström'];
const FIN_FIRST = ['Aleksi', 'Eetu', 'Joona', 'Juho', 'Kasper', 'Lauri', 'Mikko', 'Niko', 'Onni', 'Otto', 'Patrik', 'Roope', 'Sami', 'Topi', 'Valtteri', 'Veeti', 'Ville', 'Aatu', 'Eemil', 'Elmeri', 'Jesse', 'Joel', 'Konsta', 'Leevi', 'Miro', 'Oliver', 'Rasmus', 'Santeri', 'Teemu', 'Urho', 'Väinö', 'Henri', 'Arttu', 'Jere', 'Kalle'];
const FIN_LAST = ['Korhonen', 'Virtanen', 'Mäkinen', 'Nieminen', 'Mäkelä', 'Hämäläinen', 'Laine', 'Heikkinen', 'Koskinen', 'Järvinen', 'Lehtonen', 'Lehtinen', 'Saarinen', 'Salminen', 'Heinonen', 'Niemi', 'Heikkilä', 'Kinnunen', 'Salonen', 'Turunen', 'Salo', 'Laitinen', 'Tuominen', 'Rantanen', 'Karjalainen', 'Jokinen', 'Mattila', 'Savolainen', 'Lahtinen', 'Ahonen', 'Kallio', 'Hiltunen', 'Leinonen', 'Miettinen', 'Pesonen', 'Räsänen', 'Hakala', 'Aaltonen', 'Kettunen', 'Mustonen', 'Väisänen', 'Peltonen', 'Lindholm', 'Vainio', 'Pulkkinen', 'Määttä', 'Rinne', 'Hirvonen', 'Kiiskinen', 'Valtonen'];
const RUS_FIRST = ['Aleksandr', 'Dmitri', 'Ivan', 'Nikita', 'Maksim', 'Artyom', 'Kirill', 'Daniil', 'Yegor', 'Matvei', 'Mikhail', 'Andrei', 'Sergei', 'Vladislav', 'Ilya', 'Pavel', 'Roman', 'Denis', 'Arseni', 'Timur', 'Gleb', 'Yaroslav', 'Fyodor', 'Stepan', 'Vadim', 'Konstantin', 'Anton', 'Vasili', 'Semyon', 'Lev', 'Bogdan', 'Ruslan', 'Zakhar', 'Platon', 'Savva'];
const RUS_LAST = ['Ivanov', 'Smirnov', 'Kuznetsov', 'Popov', 'Vasiliev', 'Petrov', 'Sokolov', 'Mikhailov', 'Novikov', 'Fedorov', 'Morozov', 'Volkov', 'Alekseev', 'Lebedev', 'Semyonov', 'Yegorov', 'Pavlov', 'Kozlov', 'Stepanov', 'Nikolaev', 'Orlov', 'Andreev', 'Makarov', 'Nikitin', 'Zakharov', 'Zaitsev', 'Solovyov', 'Borisov', 'Yakovlev', 'Grigoriev', 'Romanov', 'Vorobyov', 'Sergeev', 'Frolov', 'Aleksandrov', 'Dmitriev', 'Korolev', 'Gusev', 'Kiselev', 'Ilyin', 'Maksimov', 'Polyakov', 'Sorokin', 'Vinogradov', 'Kovalyov', 'Belov', 'Medvedev', 'Antonov', 'Tarasov', 'Zhukov', 'Baranov', 'Filippov', 'Komarov', 'Davydov', 'Belyaev', 'Gerasimov', 'Bogdanov', 'Osipov', 'Sidorov', 'Matveev', 'Titov', 'Markov', 'Mironov', 'Krylov', 'Kulikov', 'Karpov', 'Vlasov', 'Melnikov', 'Denisov', 'Gavrilov', 'Tikhonov'];
const CZE_FIRST = ['Jakub', 'Jan', 'Tomáš', 'Matěj', 'Ondřej', 'David', 'Adam', 'Filip', 'Vojtěch', 'Lukáš', 'Martin', 'Dominik', 'Daniel', 'Marek', 'Petr', 'Michal', 'Šimon', 'Štěpán', 'Radek', 'Pavel', 'Kryštof', 'Tadeáš', 'Matyáš', 'Josef', 'Ladislav'];
const CZE_LAST = ['Novák', 'Svoboda', 'Novotný', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák', 'Němec', 'Pokorný', 'Marek', 'Pospíšil', 'Hájek', 'Jelínek', 'Král', 'Růžička', 'Beneš', 'Fiala', 'Sedláček', 'Doležal', 'Zeman', 'Kolář', 'Navrátil', 'Čermák', 'Vaněk', 'Urban', 'Blažek', 'Kříž', 'Kovář', 'Bartoš', 'Vlček', 'Polák', 'Musil', 'Kopecký', 'Šimek', 'Konečný', 'Malý', 'Holub', 'Štěpánek'];
const SVK_FIRST = ['Samuel', 'Martin', 'Tomáš', 'Matúš', 'Adam', 'Jakub', 'Michal', 'Lukáš', 'Patrik', 'Marek', 'Dávid', 'Filip', 'Šimon', 'Juraj', 'Peter', 'Róbert', 'Dalibor', 'Libor'];
const SVK_LAST = ['Horváth', 'Kováč', 'Varga', 'Tóth', 'Nagy', 'Baláž', 'Szabó', 'Molnár', 'Balog', 'Lukáč', 'Kováčik', 'Polák', 'Kollár', 'Hudák', 'Oravec', 'Mikuš', 'Gajdoš', 'Ševčík', 'Šimko', 'Bielik', 'Krajči', 'Hrivík', 'Tatar', 'Sloboda'];
const SUI_FIRST = ['Luca', 'Noah', 'Nico', 'Jonas', 'Gian', 'Timo', 'Fabio', 'Yannick', 'Dario', 'Sandro', 'Reto', 'Kevin', 'Andrin', 'Simon', 'Marco', 'Lars', 'Damien', 'Loïc'];
const SUI_LAST = ['Müller', 'Meier', 'Schmid', 'Keller', 'Weber', 'Huber', 'Schneider', 'Meyer', 'Steiner', 'Fischer', 'Gerber', 'Brunner', 'Baumann', 'Frei', 'Zimmermann', 'Moser', 'Widmer', 'Wyss', 'Graf', 'Roth', 'Bachmann', 'Suter', 'Hofer', 'Berger', 'Kunz', 'Lüthi', 'Ammann', 'Bühler'];
const GER_FIRST = ['Leon', 'Lukas', 'Jonas', 'Moritz', 'Tim', 'Niklas', 'Maximilian', 'Felix', 'Paul', 'Jan', 'Tobias', 'Philipp', 'Julian', 'Fabian', 'Dominik', 'Kai', 'Nico', 'Luis', 'Florian', 'Marcel'];
const GER_LAST = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Braun', 'Zimmermann', 'Krüger', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Kaiser', 'Fuchs', 'Peters', 'Scholz', 'Möller'];
const LAT_FIRST = ['Kristaps', 'Rūdolfs', 'Artūrs', 'Mārtiņš', 'Rihards', 'Kārlis', 'Roberts', 'Edgars', 'Dans', 'Toms', 'Oskars', 'Elvis', 'Eduards', 'Gustavs'];
const LAT_LAST = ['Bērziņš', 'Kalniņš', 'Ozoliņš', 'Jansons', 'Liepiņš', 'Krūmiņš', 'Balodis', 'Zariņš', 'Pētersons', 'Kļaviņš', 'Vītols', 'Siliņš', 'Dzenis', 'Abols', 'Egle'];
const DEN_FIRST = ['Mikkel', 'Frederik', 'Mathias', 'Oliver', 'Magnus', 'Nikolaj', 'Rasmus', 'Kasper', 'Emil', 'Jonas', 'Malthe', 'Anders'];
const DEN_LAST = ['Jensen', 'Nielsen', 'Hansen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen', 'Jørgensen', 'Madsen', 'Kristensen', 'Olsen', 'Thomsen', 'Poulsen', 'Mortensen'];
const NOR_FIRST = ['Mats', 'Sondre', 'Henrik', 'Jakob', 'Sander', 'Eirik', 'Tobias', 'Martin', 'Aksel', 'Even', 'Håkon', 'Lars'];
const NOR_LAST = ['Olsen', 'Hansen', 'Johansen', 'Larsen', 'Andersen', 'Berg', 'Haugen', 'Bakken', 'Solberg', 'Lund', 'Dahl', 'Strand', 'Moen', 'Holm'];
const AUT_FIRST = ['Lukas', 'David', 'Marco', 'Florian', 'Stefan', 'Benjamin', 'Thomas', 'Manuel', 'Raphael', 'Dominic'];
const AUT_LAST = ['Gruber', 'Huber', 'Bauer', 'Wagner', 'Pichler', 'Steiner', 'Moser', 'Mayer', 'Hofer', 'Leitner', 'Berger', 'Fuchs', 'Eder', 'Fischer'];
const BLR_FIRST = ['Artsiom', 'Uladzislau', 'Yahor', 'Mikita', 'Aliaksei', 'Dzmitry', 'Ilya', 'Pavel', 'Raman', 'Vadzim'];
const BLR_LAST = ['Kavalenka', 'Novik', 'Shablovski', 'Sharangovich', 'Lisouski', 'Zhuk', 'Kazlou', 'Bandarenka', 'Kuzmich', 'Dzmitryieu', 'Karpovich', 'Pankou'];
const KAZ_FIRST = ['Nikita', 'Dmitri', 'Arkadi', 'Sayan', 'Alikhan', 'Yerlan', 'Danil', 'Kirill'];
const KAZ_LAST = ['Akhmetov', 'Nurlanov', 'Rakhimov', 'Bekov', 'Abenov', 'Mukhamedov', 'Seitov', 'Omarov'];

// Smaller hockey nations (national-team pools: IIHF top division and Division I).
const SVN_FIRST = ['Jan', 'Luka', 'Žan', 'Nejc', 'Miha', 'Matic', 'Rok', 'Blaž', 'Gašper', 'Anže', 'Tilen', 'Jaka', 'Aljaž', 'Ožbej'];
const SVN_LAST = ['Novak', 'Horvat', 'Kovačič', 'Krajnc', 'Zupančič', 'Potočnik', 'Kos', 'Vidmar', 'Golob', 'Mlakar', 'Kolar', 'Žagar', 'Turk', 'Bizjak', 'Hribar', 'Kralj'];
const UKR_FIRST = ['Andrii', 'Oleksandr', 'Dmytro', 'Maksym', 'Bohdan', 'Vladyslav', 'Yevhen', 'Taras', 'Oleh', 'Serhii', 'Yurii', 'Denys', 'Artem', 'Illia'];
const UKR_LAST = ['Shevchenko', 'Bondarenko', 'Kovalenko', 'Tkachenko', 'Kravchenko', 'Oliinyk', 'Melnyk', 'Lysenko', 'Marchenko', 'Rudenko', 'Savchenko', 'Petrenko', 'Moroz', 'Zakharchenko'];
const HUN_FIRST = ['Bence', 'Máté', 'Dávid', 'Balázs', 'Ádám', 'Levente', 'Gergő', 'Zsombor', 'István', 'Csanád', 'Vilmos', 'Kristóf', 'Tamás', 'Bálint'];
const HUN_LAST = ['Nagy', 'Kovács', 'Szabó', 'Horváth', 'Tóth', 'Varga', 'Kiss', 'Molnár', 'Németh', 'Farkas', 'Balogh', 'Papp', 'Lakatos', 'Takács', 'Juhász', 'Mészáros'];
const ITA_FIRST = ['Luca', 'Marco', 'Alex', 'Daniel', 'Simon', 'Matteo', 'Andrea', 'Thomas', 'Lukas', 'Peter', 'Davide', 'Hannes', 'Fabian', 'Diego'];
const ITA_LAST = ['Rossi', 'Bernard', 'Frank', 'Gruber', 'Pichler', 'Kofler', 'Ferrari', 'Bianchi', 'Romano', 'Mair', 'Egger', 'Colombo', 'Moroder', 'Insam', 'Gasser', 'Ricci'];
const GBR_FIRST = ['Liam', 'Ben', 'Callum', 'Robert', 'Jordan', 'Sam', 'Ollie', 'Lewis', 'Jack', 'Harry', 'Cole', 'Josh', 'Ryan', 'Tom'];
const GBR_LAST = ['Smith', 'Jones', 'Taylor', 'Brown', 'Davies', 'Evans', 'Wilson', 'Thomas', 'Johnson', 'Roberts', 'Walker', 'Wright', 'Robinson', 'Hughes', 'Lachlan', 'Farmer'];
const FRA_FIRST = ['Hugo', 'Louis', 'Théo', 'Nathan', 'Enzo', 'Maxime', 'Alexandre', 'Antoine', 'Pierre', 'Clément', 'Valentin', 'Damien', 'Kevin', 'Floran'];
const FRA_LAST = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'Roussel'];
const POL_FIRST = ['Jakub', 'Kacper', 'Szymon', 'Mateusz', 'Filip', 'Bartosz', 'Dominik', 'Patryk', 'Krystian', 'Paweł', 'Marcin', 'Aron', 'Grzegorz', 'Kamil'];
const POL_LAST = ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski', 'Jankowski', 'Mazur'];
const JPN_FIRST = ['Yuto', 'Haruto', 'Sota', 'Ren', 'Kaito', 'Yuki', 'Daiki', 'Shota', 'Ryota', 'Takumi', 'Kenta', 'Hiroki', 'Makoto', 'Yushiroh'];
const JPN_LAST = ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Saito', 'Kato', 'Yoshida', 'Hirano', 'Furuhashi'];

export type Country = 'CAN' | 'USA' | 'SWE' | 'FIN' | 'RUS' | 'CZE' | 'SVK' | 'SUI' | 'DEU' | 'LVA' | 'DNK' | 'NOR' | 'AUT' | 'BLR' | 'KAZ'
  | 'SVN' | 'UKR' | 'HUN' | 'ITA' | 'GBR' | 'FRA' | 'POL' | 'JPN';

const POOLS: Record<Country, [string[], string[]]> = {
  CAN: [NA_FIRST, CAN_LAST],
  USA: [NA_FIRST, USA_LAST],
  SWE: [SWE_FIRST, SWE_LAST],
  FIN: [FIN_FIRST, FIN_LAST],
  RUS: [RUS_FIRST, RUS_LAST],
  CZE: [CZE_FIRST, CZE_LAST],
  SVK: [SVK_FIRST, SVK_LAST],
  SUI: [SUI_FIRST, SUI_LAST],
  DEU: [GER_FIRST, GER_LAST],
  LVA: [LAT_FIRST, LAT_LAST],
  DNK: [DEN_FIRST, DEN_LAST],
  NOR: [NOR_FIRST, NOR_LAST],
  AUT: [AUT_FIRST, AUT_LAST],
  BLR: [BLR_FIRST, BLR_LAST],
  KAZ: [KAZ_FIRST, KAZ_LAST],
  SVN: [SVN_FIRST, SVN_LAST],
  UKR: [UKR_FIRST, UKR_LAST],
  HUN: [HUN_FIRST, HUN_LAST],
  ITA: [ITA_FIRST, ITA_LAST],
  GBR: [GBR_FIRST, GBR_LAST],
  FRA: [FRA_FIRST, FRA_LAST],
  POL: [POL_FIRST, POL_LAST],
  JPN: [JPN_FIRST, JPN_LAST],
};

export function randomName(country: Country, r: () => number): [string, string] {
  const [f, l] = POOLS[country] ?? POOLS.CAN;
  let first = f[Math.floor(r() * f.length)];
  if (country === 'CAN' && r() < 0.22) first = CAN_FIRST_FR[Math.floor(r() * CAN_FIRST_FR.length)];
  return [first, l[Math.floor(r() * l.length)]];
}

/** Country mix for draft classes (approx. real NHL draft shares). */
export const DRAFT_COUNTRIES: [Country, number][] = [
  ['CAN', 0.38], ['USA', 0.25], ['SWE', 0.1], ['FIN', 0.06], ['RUS', 0.07], ['CZE', 0.05], ['SVK', 0.025], ['SUI', 0.02], ['DEU', 0.015], ['LVA', 0.008], ['DNK', 0.005], ['NOR', 0.004], ['AUT', 0.004], ['BLR', 0.004], ['KAZ', 0.002],
];

export const COACH_FIRST = ['Mike', 'Dave', 'Jim', 'Paul', 'Rick', 'Bob', 'Kevin', 'Peter', 'Bruce', 'Todd', 'Glen', 'Craig', 'Dan', 'Jeff', 'Scott', 'Mark', 'Brian', 'Jon', 'Randy', 'Andre', 'Lars', 'Sergei', 'Patrick', 'Dean'];
export const COACH_LAST = ['Harlow', 'Brennan', 'Lockwood', 'Dunmore', 'Castonguay', 'Whitcombe', 'Rutherford', 'Pellerin', 'Kincaid', 'Ashby', 'Delorme', 'Mayhew', 'Ostrander', 'Brightman', 'Fairweather', 'Galloway', 'Hollingsworth', 'Lindell', 'Marchetti', 'Northcott', 'Quenneville-Roy', 'Rowntree', 'Stromberg', 'Vandermeer', 'Wexford', 'Yardley', 'Beaudoin', 'Carrington', 'Ellsworth', 'Gauthier-Lynn'];

export const OWNER_NAMES = ['Richard Hale', 'Victoria Lang', 'Thomas Brandt', 'Elena Marsh', 'Gordon Pierce', 'Catherine Doyle', 'Harold Whitman', 'Monica Reyes', 'Stanley Graves', 'Diane Calloway'];

export const MEDIA = [
  { name: 'Ник Ледовой', handle: '@icebreaker_insider', kind: 'insider' },
  { name: 'Hockey Night Talk', handle: '@HNTalk', kind: 'show' },
  { name: 'Сандра Бортова', handle: '@boards_sandra', kind: 'insider' },
  { name: 'Cap Space Guy', handle: '@capspaceguy', kind: 'analyst' },
  { name: 'Puck Analytics', handle: '@xGoalsDaily', kind: 'analyst' },
  { name: 'Злой Фанат', handle: '@angry_fan_99', kind: 'fan' },
  { name: 'Мем-хоккей', handle: '@hockey_memes_ru', kind: 'memes' },
  { name: 'Prospect Watch', handle: '@prospectwatch', kind: 'scout' },
  { name: 'Олег Синяя Линия', handle: '@blueline_oleg', kind: 'insider' },
  { name: 'The Fourth Liner', handle: '@fourthliner', kind: 'fan' },
];
