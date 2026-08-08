// Reiseplan Striffler · Stief — USA Roadtrip 02.–18.08.2026
// Aus "USA Planung.pdf" übernommen.

// Gedämpfte, aufeinander abgestimmte Palette — wirkt ruhiger & hochwertiger.
export const FAMILY = [
  { id: 'm1', name: 'Dorothee', color: '#b0483d', pfp: 'assets/pfp/dorothee.jpg' }, // Terrakotta
  { id: 'm2', name: 'Jens',     color: '#2f6d8c', pfp: 'assets/pfp/jens.jpg' },     // Petrol-Blau
  { id: 'm3', name: 'Alex',     color: '#c39a44', pfp: 'assets/pfp/alex.jpg' },     // Ocker-Gold
  { id: 'm4', name: 'Hannah',   color: '#5c8a70', pfp: 'assets/pfp/hannah.jpg' },   // Salbei-Grün
  { id: 'm5', name: 'Maxi',     color: '#7a6aa6', pfp: 'assets/pfp/maxi.jpg' },     // Staub-Violett
  { id: 'm6', name: 'Paul',     color: '#c17a45', pfp: null },                       // Gebranntes Orange (kein Foto)
];

// Profilbild-Pfad zu einem Mitglied (per id).
export function pfpFor(id) { return (FAMILY.find(m => m.id === id) || {}).pfp || null; }

// Orte für Foto-Zuordnung (GPS-Radius in km) + Reisetage (Datum) für Fallback ohne GPS.
// Radius (km) = tatsächliche Ausdehnung des Aufenthaltsgebiets — bewusst eng,
// damit Fotos GENAU dem richtigen Ort zugeordnet werden (keine Überschneidungen).
export const STOPS = [
  { id:'lv1',     name:'Las Vegas',            lat:36.1147, lng:-115.1728, r:16, days:['2026-08-02','2026-08-03','2026-08-04'] },
  { id:'zion',    name:'Zion NP',              lat:37.2982, lng:-113.0263, r:22, days:['2026-08-04'] },
  { id:'bryce',   name:'Bryce Canyon',         lat:37.6283, lng:-112.1677, r:16, days:['2026-08-04','2026-08-05'] },
  { id:'capitol', name:'Capitol Reef',         lat:38.2833, lng:-111.2615, r:20, days:['2026-08-05'] },
  { id:'moab',    name:'Moab & Arches',        lat:38.6600, lng:-109.5300, r:24, days:['2026-08-05','2026-08-06'] },
  { id:'canyonl', name:'Canyonlands',          lat:38.3900, lng:-109.8500, r:20, days:['2026-08-06'] },
  { id:'goose',   name:'Goosenecks',           lat:37.1747, lng:-109.9264, r:5,  days:['2026-08-07'] },
  { id:'fgump',   name:'Forrest Gump Point',   lat:37.1042, lng:-109.9908, r:3,  days:['2026-08-07'] },
  { id:'mv',      name:'Monument Valley',      lat:36.9980, lng:-110.0985, r:12, days:['2026-08-07'] },
  { id:'ant',     name:'Antelope Canyon',      lat:36.8619, lng:-111.3743, r:4,  days:['2026-08-08'] },
  { id:'hb',      name:'Horseshoe Bend',       lat:36.8791, lng:-111.5104, r:3,  days:['2026-08-07','2026-08-08'] },
  { id:'page',    name:'Page (Lake Powell)',   lat:36.9147, lng:-111.4558, r:10, days:['2026-08-07','2026-08-08'] },
  { id:'gc',      name:'Grand Canyon',         lat:36.0580, lng:-112.1400, r:20, days:['2026-08-08','2026-08-09'] },
  { id:'route66', name:'Route 66 (Seligman/Oatman)', lat:35.1800, lng:-113.9500, r:55, days:['2026-08-09'] },
  { id:'jt',      name:'Joshua Tree NP',       lat:33.9908, lng:-116.1608, r:20, days:['2026-08-09'] },
  { id:'ps',      name:'Palm Springs',         lat:33.8303, lng:-116.5453, r:14, days:['2026-08-09','2026-08-10'] },
  { id:'la',      name:'Los Angeles',          lat:34.0600, lng:-118.3800, r:30, days:['2026-08-10','2026-08-11','2026-08-12'] },
  { id:'sbarb',   name:'Santa Barbara',        lat:34.4208, lng:-119.6982, r:12, days:['2026-08-12'] },
  { id:'smaria',  name:'Santa Maria',          lat:34.9530, lng:-120.4357, r:12, days:['2026-08-12','2026-08-13'] },
  { id:'sansimeon',name:'San Simeon (Seeelefanten)', lat:35.6650, lng:-121.2530, r:10, days:['2026-08-13'] },
  { id:'bigsur',  name:'Big Sur',              lat:36.2400, lng:-121.8000, r:28, days:['2026-08-13'] },
  { id:'carmel',  name:'Carmel-by-the-Sea',    lat:36.5552, lng:-121.9233, r:9,  days:['2026-08-13'] },
  { id:'sf',      name:'San Francisco',        lat:37.7900, lng:-122.4100, r:18, days:['2026-08-13','2026-08-14','2026-08-15'] },
  { id:'yos',     name:'Yosemite NP',          lat:37.7300, lng:-119.6200, r:28, days:['2026-08-15','2026-08-16'] },
  { id:'ridge',   name:'Ridgecrest',           lat:35.6225, lng:-117.6709, r:14, days:['2026-08-16','2026-08-17'] },
  { id:'lv2',     name:'Las Vegas (Rückflug)', lat:36.1000, lng:-115.1600, r:16, days:['2026-08-17','2026-08-18'] },
];

// Tagesplanung: was steht an, Aufstehzeit, Hotel, Strecke, Aktivitäten.
export const ITINERARY = [
  { date:'2026-08-02', title:'Anreise nach Las Vegas', wake:null, breakfast:false, km:null, hotel:'Hampton Inn Tropicana',
    acts:['Flug Frankfurt 15:15 → Las Vegas 17:50','Ankunft & Check-in','Erster Abend am Strip'] },
  { date:'2026-08-03', title:'Las Vegas', wake:'08:00', breakfast:true, km:0, hotel:'Hampton Inn Tropicana',
    acts:['Venetian / Grand Canal Shops','Forum Shops im Caesars Palace','Bellagio Fontänen (vormittags)','Nachmittags Hotelpool','17:30 Spaziergang Paris Las Vegas','20:30 High Roller · 21:30 Bellagio Fontänen','22:00 Fremont Street Experience'] },
  { date:'2026-08-04', title:'Zion & Bryce Canyon', wake:'04:00', breakfast:true, km:410, hotel:"Best Western PLUS Ruby's Inn",
    acts:['Abfahrt spätestens 4:30','Zion NP Ankunft ~7:30 (Visitor Center)','Emerald Pools & Kayenta Trail (Shuttle Stop 6)','Weiter nach Bryce Canyon (2h)','Abends Navajo Loop Trail'] },
  { date:'2026-08-05', title:'Bryce → Capitol Reef → Moab', wake:'06:30', breakfast:true, km:450, hotel:'Hotel Moab Downtown',
    acts:['Ab 7:00 Fairyland Loop Trail','Capitol Reef: Chimney Rock Loop (5,8 km) früh morgens','Alt.: Fruita Historic District & Scenic Drive','Arches NP: Sonnenuntergang Balanced Rock','Sternenhimmel beobachten'] },
  { date:'2026-08-06', title:'Moab: Arches & Canyonlands', wake:'06:30', breakfast:false, km:null, hotel:'Hotel Moab Downtown',
    acts:['Delicate Arch Trail ab 7:00 (1,5 h hin & zurück)','Canyonlands NP','Abends einkaufen für Frühstück & Verpflegung'] },
  { date:'2026-08-07', title:'Monument Valley & Page', wake:'07:30', breakfast:false, km:435, hotel:'LaQuinta Inn (Page)',
    acts:['Abfahrt 9:00','Valley of the Gods (mit Auto)','Goosenecks State Park · Mexican Hat','Forrest Gump Point','Monument Valley 15:30 · Wildcat Trail (~2 h)','Horseshoe Bend Sonnenuntergang (spät. 19:30)'] },
  { date:'2026-08-08', title:'Antelope Canyon & Grand Canyon', wake:'08:00', breakfast:true, km:230, hotel:'Red Feather Lodge',
    acts:['Antelope Canyon: Treff 10:00, Tour 10:30 (1,5 h)','Mittagessen 12:00–13:30','Fahrt Grand Canyon (~2,5 h)','South Kaibab Trail ab 16:30','Ooh Aah Point → Cedar Ridge & zurück','Abends Wendy’s'] },
  { date:'2026-08-09', title:'Route 66 → Palm Springs', wake:'08:00', breakfast:false, km:660, hotel:'Courtyard by Marriott Palm Springs',
    acts:['Frühstück Wendy’s 9–10','Seligman & Oatman (Westernstadt, Route 66)','13:00 Mittag & Shopping in Oatman','Cap Rock Nature Trail (Joshua Tree) ~17:30','Ankunft Palm Springs ~19:30'] },
  { date:'2026-08-10', title:'Palm Springs → Los Angeles', wake:'08:00', breakfast:true, km:220, hotel:'Courtyard by Marriott Palm Springs',
    acts:['Frühstück (Farm Palm Springs)','Forever Marilyn Monument & Stadtzentrum','Alt.: Andreas Canyon Trail (Palmen)','McDonald’s Museum San Bernardino','LA: Griffith Observatory Sonnenuntergang','Hollywood Walk of Fame · Universal City Walk'] },
  { date:'2026-08-11', title:'Los Angeles', wake:'09:00', breakfast:false, km:0, hotel:'Los Angeles',
    acts:['Santa Monica Pier & Third Street Promenade','Venice Beach: Street Art, Skatepark, Muscle Beach','The Grove · Rodeo Drive'] },
  { date:'2026-08-12', title:'LA → Santa Maria', wake:'08:00', breakfast:false, km:320, hotel:'Santa Maria Inn',
    acts:['Mittagessen in Santa Barbara','Santa Maria Style BBQ'] },
  { date:'2026-08-13', title:'Big Sur → San Francisco', wake:'07:30', breakfast:false, km:430, hotel:'Hotel Parc 55 San Francisco',
    acts:['San Simeon: Seeelefanten','Big Sur (Pfeiffer Beach Parking)','Carmel-by-the-Sea','Weiter nach San Francisco'] },
  { date:'2026-08-14', title:'San Francisco', wake:'08:00', breakfast:false, km:0, hotel:'Hotel Parc 55 San Francisco',
    acts:['Golden Gate zu Fuß · Battery Spencer','Fisherman’s Wharf (Pier 39 Seelöwen, Clam Chowder)','Lombard Street','Cable Car'] },
  { date:'2026-08-15', title:'SF → Yosemite', wake:'07:30', breakfast:false, km:315, hotel:'Yosemite View Lodge',
    acts:['Fahrt nach El Portal / Yosemite NP'] },
  { date:'2026-08-16', title:'Yosemite → Ridgecrest', wake:'07:30', breakfast:false, km:null, hotel:'Best Western China Lake Inn',
    acts:['Yosemite NP','Weiter nach Ridgecrest'] },
  { date:'2026-08-17', title:'Ridgecrest → Las Vegas', wake:'08:00', breakfast:true, km:null, hotel:'Las Vegas',
    acts:['Fahrt nach Las Vegas','Letzter Abend'] },
  { date:'2026-08-18', title:'Rückflug in die Heimat', wake:'07:00', breakfast:true, km:null, hotel:null,
    acts:['Rückflug nach Hause'] },
];

// ZEITPLAN je Tag: [StartMinute, EndMinute, StopId] aus der PDF-Tagesplanung.
// Damit landen Fotos OHNE GPS trotzdem am richtigen Ort — anhand Datum + Uhrzeit
// (z. B. 8.8. vormittags = Antelope Canyon, nachmittags = Grand Canyon).
export const SCHEDULE = {
  '2026-08-02': [[0,1440,'lv1']],
  '2026-08-03': [[0,1440,'lv1']],
  '2026-08-04': [[0,390,'lv1'],[390,660,'zion'],[660,1440,'bryce']],
  '2026-08-05': [[0,630,'bryce'],[630,870,'capitol'],[870,1440,'moab']],
  '2026-08-06': [[0,600,'moab'],[600,960,'canyonl'],[960,1440,'moab']],
  '2026-08-07': [[0,540,'moab'],[540,1080,'mv'],[1080,1440,'hb']],
  '2026-08-08': [[0,570,'page'],[570,840,'ant'],[840,1440,'gc']],
  '2026-08-09': [[0,1020,'route66'],[1020,1140,'jt'],[1140,1440,'ps']],
  '2026-08-10': [[0,1020,'ps'],[1020,1440,'la']],
  '2026-08-11': [[0,1440,'la']],
  '2026-08-12': [[0,720,'la'],[720,900,'sbarb'],[900,1440,'smaria']],
  '2026-08-13': [[0,600,'smaria'],[600,720,'sansimeon'],[720,900,'bigsur'],[900,1020,'carmel'],[1020,1440,'sf']],
  '2026-08-14': [[0,1440,'sf']],
  '2026-08-15': [[0,720,'sf'],[720,1440,'yos']],
  '2026-08-16': [[0,1080,'yos'],[1080,1440,'ridge']],
  '2026-08-17': [[0,720,'ridge'],[720,1440,'lv2']],
  '2026-08-18': [[0,1440,'lv2']],
};

// Ort laut Reiseplan zu einem Datum + Tageszeit (Minuten seit Mitternacht, Ortszeit).
export function scheduleStopFor(dateISO, minutes) {
  const day = SCHEDULE[dateISO]; if (!day) return null;
  for (const [s, e, id] of day) if (minutes >= s && minutes < e) return id;
  return day[day.length - 1][2];
}

export function haversine(aLat, aLng, bLat, bLng) {
  const R = 6371, toRad = x => x * Math.PI / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function itineraryFor(dateISO) {
  return ITINERARY.find(d => d.date === dateISO) || null;
}

// Nächstgelegener Stop zu einer Koordinate (für "wo sind wir gerade").
export function nearestStop(lat, lng) {
  let best = null;
  for (const s of STOPS) {
    const d = haversine(lat, lng, s.lat, s.lng);
    if (!best || d < best.d) best = { stop: s, d };
  }
  return best;
}
