// Pictures for recipes: an emoji per ingredient and per dish, matched by keyword (English and Arabic).

const INGREDIENTS: [RegExp, string][] = [
  [/chicken|فراخ|دجاج/i, "🍗"],
  [/beef|steak|lamb|meat|mince|لحم|كفتة/i, "🥩"],
  [/fish|salmon|tuna|سمك/i, "🐟"],
  [/shrimp|prawn|جمبري/i, "🦐"],
  [/egg|بيض/i, "🥚"],
  [/pasta|penne|spaghetti|macaroni|noodle|مكرونة/i, "🍝"],
  [/rice|رز|أرز/i, "🍚"],
  [/bread|pita|toast|عيش/i, "🍞"],
  [/flour|دقيق/i, "🌾"],
  [/garlic|توم|ثوم/i, "🧄"],
  [/onion|بصل/i, "🧅"],
  [/tomato|طماطم/i, "🍅"],
  [/potato|بطاطس/i, "🥔"],
  [/carrot|جزر/i, "🥕"],
  [/pepper|chili|فلفل/i, "🌶️"],
  [/mushroom|مشروم/i, "🍄"],
  [/spinach|lettuce|molokhia|ملوخية|سبانخ|خس/i, "🥬"],
  [/cucumber|خيار/i, "🥒"],
  [/aubergine|eggplant|بتنجان|باذنجان/i, "🍆"],
  [/corn|ذرة/i, "🌽"],
  [/broccoli/i, "🥦"],
  [/avocado/i, "🥑"],
  [/lemon|lime|ليمون/i, "🍋"],
  [/apple|تفاح/i, "🍎"],
  [/banana|موز/i, "🍌"],
  [/strawberr|فراولة/i, "🍓"],
  [/cream|milk|yogh?urt|لبن|زبادي|كريمة/i, "🥛"],
  [/cheese|parmesan|mozzarella|feta|جبن/i, "🧀"],
  [/butter|ghee|سمنة|زبدة/i, "🧈"],
  [/oil|olive|زيت/i, "🫒"],
  [/salt|ملح/i, "🧂"],
  [/sugar|honey|عسل|سكر/i, "🍯"],
  [/chocolate|cocoa|شوكولات/i, "🍫"],
  [/coffee|قهوة/i, "☕"],
  [/nut|almond|walnut|peanut|مكسرات|لوز/i, "🥜"],
  [/bean|lentil|chickpea|فول|عدس|حمص/i, "🫘"],
  [/herb|parsley|coriander|cilantro|dill|mint|basil|بقدونس|كزبرة|شبت|نعناع/i, "🌿"],
  [/water|broth|stock|مرقة|ماء/i, "💧"],
  [/spice|cumin|paprika|cardamom|cinnamon|bay|كمون|بهارات|حبهان|قرفة/i, "🫙"],
];

const DISHES: [RegExp, string][] = [
  [/pasta|spaghetti|penne|macaroni|lasagn|مكرونة/i, "🍝"],
  [/pizza|بيتزا/i, "🍕"],
  [/burger|برجر/i, "🍔"],
  [/soup|molokhia|ملوخية|شوربة|stew|طاجن/i, "🍲"],
  [/salad|سلطة/i, "🥗"],
  [/curry|rice|koshari|كشري|رز/i, "🍛"],
  [/cake|dessert|cookie|brownie|كيك|حلو/i, "🍰"],
  [/pancake|waffle/i, "🥞"],
  [/sandwich|wrap|shawarma|شاورما|ساندوتش/i, "🌯"],
  [/fish|salmon|سمك/i, "🐟"],
  [/egg|omelet|shakshuka|شكشوكة|بيض/i, "🍳"],
  [/chicken|فراخ/i, "🍗"],
  [/kofta|steak|meat|كفتة|لحم/i, "🥩"],
];

export function ingredientEmoji(text: string): string {
  return INGREDIENTS.find(([re]) => re.test(text))?.[1] ?? "🥄";
}

export function dishEmoji(title: string): string {
  return DISHES.find(([re]) => re.test(title))?.[1] ?? "🍽️";
}

export interface ParsedRecipe {
  meta: string[];
  ingredients: { amount: string; name: string }[];
  steps: string[];
  rest: string; // tips, source and anything else, as Markdown
}

/** Splits the recipe Markdown Claude writes into its parts, so it can be shown as pictures and cards. */
export function parseRecipe(content: string): ParsedRecipe {
  const lines = content.split("\n");
  const out: ParsedRecipe = { meta: [], ingredients: [], steps: [], rest: "" };
  const rest: string[] = [];
  let section: "intro" | "ingredients" | "steps" | "other" = "intro";
  for (const raw of lines) {
    const line = raw.trim();
    const heading = line.match(/^#{1,3}\s+(.*)$/);
    if (heading) {
      const h = heading[1].toLowerCase();
      section = /ingredient|مكونات|المقادير/.test(h) ? "ingredients" : /step|method|instruction|طريقة|الخطوات/.test(h) ? "steps" : "other";
      if (section === "other") rest.push(raw);
      continue;
    }
    if (!line) {
      if (section === "other") rest.push(raw);
      continue;
    }
    if (section === "intro" && !out.meta.length && /·|min|serving|⏱/i.test(line)) {
      out.meta = line.split("·").map((m) => m.trim()).filter(Boolean);
      continue;
    }
    if (section === "ingredients") {
      const text = line.replace(/^[-*]\s*(\[[ xX]\]\s*)?/, "");
      const m = text.match(/^([\d½¼¾/.,\s-]+\s*(?:g|kg|ml|l|tbsp|tsp|cups?|cloves?|pieces?|pcs|handful|pinch|cans?|جم|كجم|ملعقة|كوب|فص)?\.?)\s+(.*)$/i);
      out.ingredients.push(m ? { amount: m[1].trim(), name: m[2] } : { amount: "", name: text });
      continue;
    }
    if (section === "steps") {
      out.steps.push(line.replace(/^(\d+[.)]|[-*])\s*/, ""));
      continue;
    }
    rest.push(raw);
  }
  out.rest = rest.join("\n").trim();
  return out;
}

/** "fry for 6 minutes" → 6, so cook mode can offer a timer. */
export function stepMinutes(step: string): number | null {
  const m = step.match(/(\d+)\s*(?:-|to)?\s*(?:\d+\s*)?(?:min|minute|دقيقة|دقايق)/i);
  return m ? Number(m[1]) : null;
}
