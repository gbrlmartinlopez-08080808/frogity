// The fifty pictures of the What's new card, in the order they come (each update shows one and opens a window onto the next).
// All are public domain or CC0, from The Met's Open Access collection, NASA, and Wikimedia Commons; the files are in public/art,
// cropped to the card's shape (1080 × 600).
export interface Art {
  id: string;
  title: string;
  artist: string;
  licence: string;
  source: string;
}

export const ART: Art[] = [
  { id: "wave", title: "The Great Wave off Kanagawa", artist: "Katsushika Hokusai", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/39799" },
  { id: "northeaster", title: "Northeaster", artist: "Winslow Homer", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/11130" },
  { id: "lane", title: "The Golden State Entering New York Harbor", artist: "Fitz Henry Lane", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/11395" },
  { id: "starry", title: "The Starry Night", artist: "Vincent van Gogh", licence: "public domain \u00b7 Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg" },
  { id: "carina", title: "Cosmic Cliffs, Carina Nebula", artist: "NASA, ESA, CSA, STScI · Webb", licence: "public domain \u00b7 NASA", source: "https://images.nasa.gov/details/carina_nebula" },
  { id: "southernring", title: "Southern Ring Nebula", artist: "NASA, ESA, CSA, STScI · Webb", licence: "public domain \u00b7 NASA", source: "https://images.nasa.gov/details/southern_ring_nebula" },
  { id: "jupiter", title: "Jupiter Blues", artist: "NASA/JPL · Juno", licence: "public domain \u00b7 NASA", source: "https://images.nasa.gov/details/PIA22946" },
  { id: "bluemarble", title: "The Blue Marble", artist: "NASA · Apollo 17", licence: "public domain \u00b7 NASA", source: "https://images.nasa.gov/details/as17-148-22727" },
  { id: "earthrise", title: "Earthrise", artist: "NASA · Apollo 8", licence: "public domain \u00b7 NASA", source: "https://images.nasa.gov/details/as08-14-2383" },
  { id: "flammarion", title: "The Flammarion engraving", artist: "Anonymous, 1888", licence: "public domain \u00b7 Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:Flammarion.jpg" },
  { id: "cellarius", title: "Harmonia Macrocosmica", artist: "Andreas Cellarius", licence: "public domain \u00b7 Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:Cellarius_Harmonia_Macrocosmica_-_Planisphaerium_Ptolemaicum.jpg" },
  { id: "astrolabe", title: "Astrolabe", artist: "Regiomontanus", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/923639" },
  { id: "celestialglobe", title: "Celestial globe", artist: "Willem Jansz Blaeu", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/207816" },
  { id: "astronomy", title: "The Celestial Map, Northern Hemisphere", artist: "Albrecht Dürer", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/358366" },
  { id: "jerome", title: "Saint Jerome in His Study", artist: "Albrecht Dürer", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/336229" },
  { id: "knight", title: "Knight, Death, and the Devil", artist: "Albrecht Dürer", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/336223" },
  { id: "rhino", title: "Rhinoceros", artist: "Albrecht Dürer", licence: "public domain \u00b7 Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:D%C3%BCrer%27s_Rhinoceros%2C_1515.jpg" },
  { id: "haeckel_radio", title: "Phaeodaria (Kunstformen der Natur)", artist: "Ernst Haeckel", licence: "public domain \u00b7 Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:Haeckel_Phaeodaria_61.jpg" },
  { id: "haeckel_hum", title: "Trochilidae (Kunstformen der Natur)", artist: "Ernst Haeckel", licence: "public domain \u00b7 Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:Haeckel_Trochilidae.jpg" },
  { id: "flamingo", title: "American Flamingo (Birds of America)", artist: "John James Audubon", licence: "public domain \u00b7 Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:431_American_Flamingo.jpg" },
  { id: "merian", title: "Study of Capers, Gorse and a Beetle", artist: "Maria Sibylla Merian", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/399922" },
  { id: "bosschaert", title: "Bouquet of Flowers in a Roemer", artist: "Ambrosius Bosschaert the Elder", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/922227" },
  { id: "redon", title: "Bouquet of Flowers", artist: "Odilon Redon", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/437379" },
  { id: "irises", title: "Irises", artist: "Vincent van Gogh", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/436528" },
  { id: "roses", title: "Roses", artist: "Vincent van Gogh", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/436534" },
  { id: "oleanders", title: "Oleanders", artist: "Vincent van Gogh", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/436530" },
  { id: "sunflowers", title: "Sunflowers", artist: "Vincent van Gogh", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/436524" },
  { id: "wheat", title: "Wheat Field with Cypresses", artist: "Vincent van Gogh", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/436535" },
  { id: "cypresses", title: "Cypresses", artist: "Vincent van Gogh", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/437980" },
  { id: "greenfield", title: "Green Field", artist: "Vincent van Gogh", licence: "public domain \u00b7 Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_Green_Field_-_Google_Art_Project.jpg" },
  { id: "harvesters", title: "The Harvesters", artist: "Pieter Bruegel the Elder", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/435809" },
  { id: "kells", title: "Book of Kells, Chi Rho page", artist: "Trinity College Dublin", licence: "public domain \u00b7 Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:KellsFol034rChiRhoMonogram.jpg" },
  { id: "belles", title: "The Belles Heures of Jean de France", artist: "The Limbourg Brothers", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/470306" },
  { id: "piranesi", title: "Carceri (Prisoners on a Projecting Platform)", artist: "Giovanni Battista Piranesi", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/362671" },
  { id: "threetrees", title: "The Three Trees", artist: "Rembrandt", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/354633" },
  { id: "wanderer", title: "Wanderer above the Sea of Fog", artist: "Caspar David Friedrich", licence: "public domain \u00b7 Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg" },
  { id: "landers", title: "The Rocky Mountains, Lander's Peak", artist: "Albert Bierstadt", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/10154" },
  { id: "merced", title: "Merced River, Yosemite Valley", artist: "Albert Bierstadt", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/10150" },
  { id: "andes", title: "Heart of the Andes", artist: "Frederic Edwin Church", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/10481" },
  { id: "oxbow", title: "The Oxbow", artist: "Thomas Cole", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/10497" },
  { id: "sainte", title: "Mont Sainte-Victoire", artist: "Paul Cézanne", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/435878" },
  { id: "impression", title: "Impression, Sunrise", artist: "Claude Monet", licence: "public domain \u00b7 Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:Monet_-_Impression%2C_Sunrise.jpg" },
  { id: "temeraire", title: "The Fighting Temeraire", artist: "J. M. W. Turner", licence: "public domain \u00b7 Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:The_Fighting_Temeraire%2C_JMW_Turner%2C_National_Gallery.jpg" },
  { id: "grandcanal", title: "Venice, from the Porch of Madonna della Salute", artist: "Joseph Mallord William Turner", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/437853" },
  { id: "stars_japan", title: "Ryōgoku Bridge (One Hundred Famous Views of Edo)", artist: "Utagawa Hiroshige", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/45294" },
  { id: "hiroshige", title: "Sudden Shower over Shin-Ōhashi Bridge", artist: "Utagawa Hiroshige", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/55433" },
  { id: "hokusai_bridge", title: "The Boat-bridge at Sano", artist: "Katsushika Hokusai", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/53787" },
  { id: "kirifuri", title: "Kirifuri Waterfall", artist: "Katsushika Hokusai", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/55019" },
  { id: "amida", title: "The Amida Falls", artist: "Katsushika Hokusai", licence: "CC0 \u00b7 The Met", source: "https://www.metmuseum.org/art/collection/search/55022" },
  { id: "redfuji", title: "Fine Wind, Clear Morning", artist: "Katsushika Hokusai", licence: "public domain \u00b7 Wikimedia Commons", source: "https://commons.wikimedia.org/wiki/File:Red_Fuji_southern_wind_clear_morning.jpg" },
];
