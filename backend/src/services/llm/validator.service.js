export const validatePreferences = (preferences, schema, userPrompt = "") => {
  const lowerPrompt = userPrompt.toLowerCase();

  const clean = {
    district: preferences.district || null,
    hotelCategory: preferences.hotelCategory || null,
    grade: preferences.grade || null,
    foodType: preferences.foodType || null,
    durationDays: preferences.durationDays || null,
    activityCategory: preferences.activityCategory || null,
    priceLevel: preferences.priceLevel || null,
    suitableFor: preferences.suitableFor || null,
  };

  // duration fallback
  if (!clean.durationDays) {
    const wordNumbers = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
    };

    for (const [word, num] of Object.entries(wordNumbers)) {
      if (
        lowerPrompt.includes(`${word} day`) ||
        lowerPrompt.includes(`${word} days`)
      ) {
        clean.durationDays = num;
      }
    }

    const digitMatch = lowerPrompt.match(/(\d+)\s*(day|days)/);
    if (digitMatch) {
      clean.durationDays = Number(digitMatch[1]);
    }
  } else {
    clean.durationDays = Number(clean.durationDays);
  }

  // activity fallback
  if (!clean.activityCategory) {
    if (lowerPrompt.includes("nature")) clean.activityCategory = "Nature";
    if (lowerPrompt.includes("beach")) clean.activityCategory = "Beach";
    if (lowerPrompt.includes("adventure")) clean.activityCategory = "Adventure";
    if (lowerPrompt.includes("culture") || lowerPrompt.includes("cultural"))
      clean.activityCategory = "Culture";
    if (lowerPrompt.includes("food")) clean.activityCategory = "Food";
    if (lowerPrompt.includes("wellness")) clean.activityCategory = "Wellness";
    if (lowerPrompt.includes("religious")) clean.activityCategory = "Religious";
    if (lowerPrompt.includes("wildlife")) clean.activityCategory = "Wildlife";
  }

  // grade normalization
  if (clean.grade) {
    const grade = clean.grade.toLowerCase();

    if (
      grade.includes("luxury") ||
      grade.includes("premium") ||
      grade.includes("high") ||
      grade.includes("deluxe")
    ) {
      clean.grade = "deluxe";
    }
  } else {
    if (
      lowerPrompt.includes("luxury") ||
      lowerPrompt.includes("premium") ||
      lowerPrompt.includes("high class") ||
      lowerPrompt.includes("best hotel") ||
      lowerPrompt.includes("deluxe")
    ) {
      clean.grade = "deluxe";
    }
  }

  // food normalization
  if (clean.foodType) {
    const food = clean.foodType.toLowerCase();

    if (food.includes("non")) {
      clean.foodType = "Non-Veg";
    } else if (food.includes("veg")) {
      clean.foodType = "Veg";
    }
  } else {
    if (
      lowerPrompt.includes("non veg") ||
      lowerPrompt.includes("non-veg") ||
      lowerPrompt.includes("meat")
    ) {
      clean.foodType = "Non-Veg";
    } else if (
      lowerPrompt.includes("veg") ||
      lowerPrompt.includes("vegetarian")
    ) {
      clean.foodType = "Veg";
    }
  }

  // schema validation
  if (clean.district && !schema.districts.includes(clean.district)) {
    clean.district = null;
  }

  if (
    clean.hotelCategory &&
    !schema.hotelCategories.includes(clean.hotelCategory)
  ) {
    clean.hotelCategory = null;
  }

  if (clean.grade && !schema.grades.includes(clean.grade)) {
    clean.grade = null;
  }

  if (
    clean.activityCategory &&
    !schema.activityCategories.includes(clean.activityCategory)
  ) {
    clean.activityCategory = null;
  }

  if (clean.priceLevel && !schema.priceLevels.includes(clean.priceLevel)) {
    clean.priceLevel = null;
  }

  if (clean.suitableFor && !schema.suitableFor.includes(clean.suitableFor)) {
    clean.suitableFor = null;
  }

  return clean;
};