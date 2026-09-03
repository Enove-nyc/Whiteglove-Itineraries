/**
 * THE WORDS A FORWARDING ADDRESS IS MADE OF.
 *
 * The address used to read trips+Xk9_2mQvBz8Lw3aP@ — sixteen random
 * characters, mixed case, with underscores in it. Unguessable, and impossible
 * to read off a screen, say down a phone or type by hand without getting it
 * wrong. It reads trips+cedar-harbor-lantern-swift@ now, which is the same
 * address doing the same job in words somebody can actually carry.
 *
 * EXACTLY 512 WORDS, AND THAT IS WHY. Four words drawn from 512 is 2^36 —
 * about seventy billion addresses — so the token stays a credential nobody can
 * guess rather than a nickname. A wrong one routes nowhere and answers 200, so
 * there is nothing to tell a guesser they were close; the queue is capped, so
 * a lucky guess buys one entry somebody reads and throws away, never a row on
 * a trip. The count is held by a test, because dropping a word silently
 * weakens every address issued afterwards.
 *
 * CHOSEN TO BE SAID ALOUD. Everything here is a common concrete English noun,
 * three to ten letters, nothing that sounds like anything else on the list,
 * and nothing anybody would be embarrassed to read out to a hotel. No
 * homophones, no plurals, no proper nouns.
 */

export const INBOUND_WORDS: readonly string[] = [
  "amber", "anchor", "apple", "apricot", "aqueduct", "arbor", "arch", "arctic", "arrow", "ash", "aspen",
  "atlas", "autumn", "azure", "badge", "badger", "bamboo", "banjo", "barley", "basalt", "basil", "bay",
  "beacon", "beech", "bell", "birch", "bison", "blossom", "blue", "bluff", "bolt", "bonfire", "borough",
  "boulder", "bramble", "brass", "breeze", "brick", "bridge", "bronze", "brook", "bugle", "burrow",
  "butter", "cabin", "cable", "cairn", "calm", "camel", "candle", "cane", "canvas", "canyon", "cape",
  "captain", "caravan", "carbon", "cargo", "carol", "carrot", "cascade", "cavern", "cedar", "cellar",
  "cement", "chalk", "channel", "chapel", "charcoal", "chart", "cherry", "chestnut", "chime", "cinder",
  "circle", "citrus", "clay", "cliff", "clover", "coast", "cobalt", "cobble", "cocoa", "comet", "compass",
  "copper", "coral", "cork", "cornice", "cottage", "cotton", "courtyard", "cove", "crater", "cream",
  "crescent", "crest", "crimson", "crossing", "crystal", "cupola", "cypress", "daisy", "damson", "dawn",
  "delta", "denim", "desert", "dew", "dial", "diamond", "dock", "dolphin", "dome", "donkey", "draft",
  "dragon", "drawbridge", "drift", "drum", "dune", "dusk", "eagle", "east", "ebony", "echo", "elder",
  "ember", "emerald", "engine", "ermine", "estate", "ether", "fable", "fairway", "falcon", "fallow",
  "fathom", "feather", "fern", "ferry", "fiddle", "fig", "filbert", "finch", "fjord", "flag", "flame",
  "flannel", "flax", "flint", "flora", "flute", "foam", "forest", "forge", "fossil", "fountain", "fox",
  "frost", "gallery", "galley", "garden", "garnet", "gate", "gateway", "gazelle", "ginger", "glacier",
  "glade", "glass", "glen", "globe", "gold", "gorge", "granary", "granite", "grape", "gravel", "green",
  "grotto", "grove", "gull", "gypsum", "hail", "hamlet", "harvest", "hawk", "hazel", "hearth", "heath",
  "hedge", "helm", "hemlock", "heron", "hickory", "hollow", "honey", "hoop", "horizon", "hornet",
  "hurdle", "indigo", "inlet", "iris", "iron", "island", "ivory", "ivy", "jade", "jasmine", "jasper",
  "jetty", "jewel", "jungle", "juniper", "kayak", "keel", "kelp", "kestrel", "kettle", "key", "kiln",
  "kite", "lace", "ladder", "lagoon", "lake", "lamp", "lantern", "larch", "lark", "laurel", "lava",
  "leaf", "ledge", "lemon", "lentil", "lighthouse", "lilac", "lily", "linden", "linen", "lion", "lodge",
  "loft", "lookout", "lotus", "lumber", "lunar", "lupine", "lynx", "magnet", "mahogany", "maize",
  "mallow", "mangrove", "manor", "maple", "marble", "marigold", "marsh", "mast", "meadow", "meander",
  "melon", "merit", "mesa", "mica", "midnight", "millet", "mint", "mirror", "mist", "moat", "monsoon",
  "moor", "morning", "mosaic", "mountain", "mulberry", "mural", "myrtle", "nectar", "needle", "nest",
  "nettle", "nickel", "night", "noble", "north", "nutmeg", "oak", "oasis", "oat", "ocean", "ochre",
  "olive", "onyx", "opal", "orchard", "orchid", "osprey", "otter", "outpost", "oyster", "paddle", "palm",
  "pampas", "papaya", "paprika", "parapet", "parcel", "parsley", "pasture", "pathway", "patio",
  "pavilion", "peach", "pear", "pearl", "pebble", "pelican", "pepper", "petal", "pheasant", "pigment",
  "pillar", "pine", "pinnacle", "pistachio", "plaza", "plum", "plume", "polar", "pollen", "pond",
  "poplar", "poppy", "porch", "portage", "prairie", "primrose", "prism", "puffin", "pumice", "quail",
  "quarry", "quartz", "quayside", "quill", "quince", "radish", "rafter", "rail", "rainbow", "rampart",
  "raven", "ravine", "reed", "reef", "relay", "ribbon", "ridge", "rill", "river", "robin", "rock",
  "rookery", "rosemary", "rowan", "rudder", "rush", "rye", "sable", "saffron", "sage", "sail", "salmon",
  "salt", "sand", "sandal", "sapphire", "satin", "savanna", "scarlet", "schooner", "scout", "seal",
  "sedge", "sequoia", "shale", "shamrock", "sheaf", "shell", "shelter", "shore", "signal", "silk",
  "silver", "siren", "sisal", "slate", "sloop", "smoke", "snow", "sorrel", "south", "spice", "spinach",
  "spire", "spruce", "squall", "stable", "stag", "stamp", "starling", "station", "stone", "stork",
  "storm", "strait", "straw", "stream", "summit", "sunbeam", "sundial", "sunrise", "sunset", "swallow",
  "swan", "sycamore", "syrup", "tablet", "talon", "tamarind", "tandem", "tangerine", "tapestry", "tavern",
  "teak", "teal", "tempo", "terrace", "terrapin", "thicket", "thimble", "thistle", "thorn", "thrush",
  "thyme", "tide", "timber", "tinder", "toffee", "topaz", "torch", "tower", "trail", "tramway", "trellis",
  "trestle", "triangle", "trout", "trumpet", "tundra", "tunnel", "turban", "turmeric", "turquoise",
  "turtle", "twine", "umber", "vale", "valley", "vane", "vanilla", "velvet", "veranda", "verbena",
  "vessel", "viaduct", "vineyard", "viola", "violet", "vista", "walnut", "warbler", "water", "waterfall",
  "wattle", "wave", "weaver", "west", "wharf", "wheat", "whistle", "willow", "window", "winter",
  "wisteria", "wolf", "wombat", "woodland", "woodlark", "wren", "yarrow", "yellow", "yew", "zephyr",
  "zinc", "zinnia",
];
