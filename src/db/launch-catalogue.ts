/**
 * Launch catalogue (owner-confirmed 2026-11-03).
 *
 * Everything here is seeded as a DRAFT. Plants need expert review (LMY-34) and
 * products need an admin-set selling price (LMY-35) before anything is published.
 * The seed never overwrites a row an admin has since edited or published.
 */

import type { PlantNeeds } from "@/lib/grow/suitability";

export type LaunchPlant = {
  slug: string;
  commonName: string;
  localNames: string[];
  botanicalName: string;
  category: "herbs" | "leafy-greens" | "vegetables" | "fruit" | "ornamentals";
  tagline: string;
  summaryLine: string;
  /** Starting point for "Can I grow this here?"; needs expert review (LMY-34). */
  needs: PlantNeeds;
};

export const LAUNCH_PLANTS: LaunchPlant[] = [
  // Herbs
  { slug: "scent-leaf", commonName: "Scent leaf", localNames: ["Efirin", "Nchanwu", "Daidoya"], botanicalName: "Ocimum gratissimum", category: "herbs", tagline: "The pepper soup favourite you can pick from your window.", summaryLine: "Herb · beginner friendly", needs: { sun: "part", container: "medium", water: "medium", indoorOk: false } },
  { slug: "sweet-basil", commonName: "Sweet basil", localNames: [], botanicalName: "Ocimum basilicum", category: "herbs", tagline: "The little herb with a lot of personality.", summaryLine: "Herb · beginner friendly", needs: { sun: "full", container: "medium", water: "medium", indoorOk: false } },
  { slug: "mint", commonName: "Mint", localNames: [], botanicalName: "Mentha spp.", category: "herbs", tagline: "Fresh, cooling and very keen to grow.", summaryLine: "Herb · spreads fast", needs: { sun: "part", container: "medium", water: "high", indoorOk: true } },
  { slug: "lemongrass", commonName: "Lemongrass", localNames: ["Kooko oba"], botanicalName: "Cymbopogon citratus", category: "herbs", tagline: "Tea, tisanes and a fresh smell every time you brush past.", summaryLine: "Herb · very hardy", needs: { sun: "full", container: "large", water: "medium", indoorOk: false } },
  // Leafy greens
  { slug: "ugu", commonName: "Ugu", localNames: ["Fluted pumpkin"], botanicalName: "Telfairia occidentalis", category: "leafy-greens", tagline: "Soup leaves on tap, straight from your own vine.", summaryLine: "Leafy green · needs space to climb", needs: { sun: "full", container: "ground", water: "high", indoorOk: false, climbs: true } },
  { slug: "green-amaranth", commonName: "Green amaranth", localNames: ["Efo tete", "Inine"], botanicalName: "Amaranthus hybridus", category: "leafy-greens", tagline: "Quick, tender greens for your efo riro.", summaryLine: "Leafy green · fast to harvest", needs: { sun: "full", container: "medium", water: "medium", indoorOk: false } },
  { slug: "waterleaf", commonName: "Waterleaf", localNames: ["Gbure", "Mmong mmong ikong"], botanicalName: "Talinum fruticosum", category: "leafy-greens", tagline: "Soft, juicy leaves that love Lagos humidity.", summaryLine: "Leafy green · beginner friendly", needs: { sun: "part", container: "medium", water: "high", indoorOk: false } },
  { slug: "ewedu", commonName: "Ewedu", localNames: ["Jute mallow", "Ahihara"], botanicalName: "Corchorus olitorius", category: "leafy-greens", tagline: "Grow the leaves for a proper bowl of ewedu.", summaryLine: "Leafy green · fast to harvest", needs: { sun: "full", container: "medium", water: "medium", indoorOk: false } },
  { slug: "bitter-leaf", commonName: "Bitter leaf", localNames: ["Ewuro", "Onugbu"], botanicalName: "Vernonia amygdalina", category: "leafy-greens", tagline: "A tough little shrub that keeps on giving.", summaryLine: "Leafy green · very hardy", needs: { sun: "part", container: "large", water: "medium", indoorOk: false } },
  // Vegetables
  { slug: "cherry-tomato", commonName: "Cherry tomato", localNames: [], botanicalName: "Solanum lycopersicum var. cerasiforme", category: "vegetables", tagline: "Sweet little tomatoes you'll eat straight off the plant.", summaryLine: "Vegetable · needs full sun", needs: { sun: "full", container: "large", water: "high", indoorOk: false, climbs: true } },
  { slug: "ata-rodo", commonName: "Ata rodo", localNames: ["Scotch bonnet pepper"], botanicalName: "Capsicum chinense", category: "vegetables", tagline: "Bring the heat home. One plant goes a long way.", summaryLine: "Vegetable · great in pots", needs: { sun: "full", container: "medium", water: "medium", indoorOk: false } },
  { slug: "spring-onion", commonName: "Spring onion", localNames: ["Alubosa elewe"], botanicalName: "Allium fistulosum", category: "vegetables", tagline: "Snip, use, and watch it grow back.", summaryLine: "Vegetable · regrows after cutting", needs: { sun: "part", container: "small", water: "medium", indoorOk: true } },
  { slug: "okra", commonName: "Okra", localNames: ["Ila", "Okwuru"], botanicalName: "Abelmoschus esculentus", category: "vegetables", tagline: "Pretty flowers first, then pods for your soup.", summaryLine: "Vegetable · loves the heat", needs: { sun: "full", container: "large", water: "medium", indoorOk: false } },
  // Fruit
  { slug: "dwarf-lime", commonName: "Dwarf lime", localNames: ["Osan wewe"], botanicalName: "Citrus aurantiifolia", category: "fruit", tagline: "A small citrus tree that's happy in a big pot.", summaryLine: "Fruit · slow and rewarding", needs: { sun: "full", container: "xlarge", water: "medium", indoorOk: false } },
  // Ornamentals
  { slug: "aloe-vera", commonName: "Aloe vera", localNames: [], botanicalName: "Aloe barbadensis miller", category: "ornamentals", tagline: "Low effort, good looking and handy to have around.", summaryLine: "Succulent · forgives missed watering", needs: { sun: "part", container: "small", water: "low", indoorOk: true } },
  { slug: "snake-plant", commonName: "Snake plant", localNames: ["Mother-in-law's tongue"], botanicalName: "Dracaena trifasciata", category: "ornamentals", tagline: "The plant that's almost impossible to kill.", summaryLine: "Indoor plant · low light friendly", needs: { sun: "low", container: "small", water: "low", indoorOk: true } },
];

export type LaunchProduct = {
  slug: string;
  sku: string;
  name: string;
  category: "starter-kits" | "plants-and-seeds" | "growing-materials" | "tools-and-accessories";
  description: string;
  stock: number;
};

/** Prices are deliberately absent: an admin sets the selling price before publishing. */
export const LAUNCH_PRODUCTS: LaunchProduct[] = [
  {
    slug: "mini-garden-tool-set-7",
    sku: "LMY-TOOLSET-7",
    name: "Mini garden tool set, 7 pieces",
    category: "tools-and-accessories",
    description:
      "Seven small hand tools with wooden handles for pots, grow bags and raised beds: two trowels, a hand fork, a narrow transplanting trowel, a small rake, a small spade and a mini shovel. Good for transplanting, loosening soil and weeding.",
    stock: 10,
  },
  {
    slug: "nursery-pots-1-gallon-10",
    sku: "LMY-POT-1GAL-10",
    name: "Nursery pots, 1 gallon, pack of 10",
    category: "growing-materials",
    description:
      "Ten black 1-gallon (about 4 litre) nursery pots with drainage holes. Light, flexible and stackable. A good size for herbs, peppers and seedlings, indoors or outside.",
    stock: 10,
  },
];
